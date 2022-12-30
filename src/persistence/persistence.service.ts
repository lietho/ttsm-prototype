import { AllStreamResolvedEvent, jsonEvent, MetadataType, StreamSubscription } from "@eventstore/db-client";
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { hideInternalType } from "src/persistence/utils/hide-internal-type";
import { aggregateWorkflowEvents } from "src/persistence/utils/workflow-aggregation";
import { aggregateWorkflowInstanceEvents } from "src/persistence/utils/workflow-instance-aggregation";
import { randomUUIDv4 } from "../core/utils";
import { environment } from "../environment";
import {
  Workflow,
  WorkflowInstance,
  WorkflowInstanceProposal,
  WorkflowInstanceTransition,
  WorkflowProposal
} from "../workflow";

import {
  client as eventStore,
  connect as connectToEventStore,
  WORKFLOW_INSTANCES_PROJECTION,
  WORKFLOW_INSTANCES_PROJECTION_NAME,
  WORKFLOWS_PROJECTION,
  WORKFLOWS_PROJECTION_NAME
} from "./eventstoredb";
import * as eventTypes from "./persistence.events";
import { PersistenceEvent } from "./utils";

type StateTransition = { event: string, timestamp: string, payload: any };

/**
 * Adapter service for third party event sourcing services.
 */
@Injectable()
export class PersistenceService implements OnModuleInit, OnModuleDestroy {

  private readonly logger = new Logger(PersistenceService.name);
  private readonly subscriptions: StreamSubscription[] = [];

  /** @inheritDoc */
  async onModuleInit() {
    this.logger.log(`Establishing connection to event store on "${environment.persistence.serviceUrl}"`);
    await connectToEventStore();

    this.logger.log(`Creating event store projections: ${[WORKFLOWS_PROJECTION_NAME, WORKFLOW_INSTANCES_PROJECTION_NAME].join(", ")}`);
    await eventStore.createProjection(WORKFLOWS_PROJECTION_NAME, WORKFLOWS_PROJECTION);
    await eventStore.createProjection(WORKFLOW_INSTANCES_PROJECTION_NAME, WORKFLOW_INSTANCES_PROJECTION);
  }

  /**
   * Proposes a new workflow to all participants.
   * @param proposal
   */
  async proposeWorkflow(proposal: Omit<WorkflowProposal, "consistencyId">): Promise<Workflow> {
    const proposedWorkflow: Workflow = {
      ...proposal,
      consistencyId: randomUUIDv4()
    };
    await this.appendToStream(`workflows.${proposedWorkflow.consistencyId}`, eventTypes.proposeWorkflow(proposedWorkflow));
    return proposedWorkflow as Workflow;
  }

  /**
   * Dispatches a workflow specification event.
   * @param id Workflow ID.
   * @param event Event to be dispatched.
   */
  async dispatchWorkflowEvent<T>(id: string, event: PersistenceEvent<T>): Promise<void> {
    return await this.appendToStream(`workflows.${id}`, event);
  }

  /**
   * Dispatches a workflow instance event.
   * @param id Workflow instance ID.
   * @param event Event to be dispatched.
   */
  async dispatchInstanceEvent<T>(id: string, event: PersistenceEvent<T>): Promise<void> {
    return await this.appendToStream(`instances.${id}`, event);
  }

  /**
   * Launches a new instances of a certain workflow.
   * @param proposal
   */
  async launchWorkflowInstance(proposal: Omit<WorkflowInstanceProposal, "consistencyId">): Promise<WorkflowInstance> {
    const proposedWorkflowInstance: WorkflowInstance = {
      ...proposal,
      consistencyId: randomUUIDv4()
    };
    await this.appendToStream(`instances.${proposedWorkflowInstance.consistencyId}`, eventTypes.launchWorkflowInstance(proposedWorkflowInstance));
    return proposedWorkflowInstance as WorkflowInstance;
  }

  /**
   * Advances the state of a specific workflow instance.
   * @param transition
   */
  async advanceWorkflowInstanceState(transition: WorkflowInstanceTransition): Promise<void> {
    await this.appendToStream(`instances.${transition.id}`, eventTypes.advanceWorkflowInstance(transition));
  }

  async getWorkflowStateAt(id: string, at: Date): Promise<Workflow | null> {
    const eventStream = await this.readStream(`workflows.${id}`);
    try {
      const events = [];
      for await (const { event } of eventStream) {
        const timestamp = new Date(event.created / 10000);
        if (timestamp.getTime() > at.getTime()) {
          break;
        }
        events.push(event);
      }

      return aggregateWorkflowEvents(events);
    } catch (e) {
      return null;
    }
  }

  async getWorkflowInstanceStateAt(id: string, at: Date): Promise<WorkflowInstance | null> {
    const eventStream = await this.readStream(`instances.${id}`);
    try {
      const events = [];
      for await (const { event } of eventStream) {
        const timestamp = new Date(event.created / 10000);
        if (timestamp.getTime() > at.getTime()) {
          break;
        }
        events.push(event);
      }

      return aggregateWorkflowInstanceEvents(events);
    } catch (e) {
      return null;
    }
  }

  /**
   * Returns all payloads attached to state transitions until the given point in time.
   * @param id Workflow instance ID.
   * @param until Point in time until which should be search.
   */
  async getWorkflowInstanceStateTransitionPayloadsUntil(id: string, until: Date): Promise<StateTransition[] | null> {
    const result: StateTransition[] = [];
    const events = await this.readStream(`instances.${id}`);
    try {
      for await (const { event } of events) {
        const timestamp = new Date(event.created / 10000);
        if (timestamp.getTime() > until.getTime()) {
          break;
        }
        if (!eventTypes.advanceWorkflowInstance.sameAs(event.type)) {
          continue;
        }
        const stateMachineEvent = event.data as unknown as WorkflowInstanceTransition;
        result.push({
          event: stateMachineEvent.event,
          timestamp: timestamp.toISOString(),
          payload: stateMachineEvent.payload
        });
      }
    } catch (e) {
      return null;
    }
    return result;
  }

  /**
   * Returns the workflow with the given ID.
   * @param id Workflow ID.
   */
  async getWorkflowById(id: string): Promise<Workflow> {
    return (await this.getWorkflowsAggregate())[id];
  }

  /**
   * Returns the workflow instance with the given ID.
   * @param id Workflow instance ID.
   */
  async getWorkflowInstanceById(id: string): Promise<WorkflowInstance> {
    return (await this.getWorkflowInstancesAggregate())[id];
  }

  /**
   * Returns all workflow instances of the given workflow.
   * @param workflowId Workflow ID.
   */
  async getWorkflowInstancesOfWorkflow(workflowId: string): Promise<WorkflowInstance[]> {
    return Object
      .entries(await this.getWorkflowInstancesAggregate())
      .filter(([, instance]) => instance.workflowId === workflowId)
      .map(([, instance]) => instance);
  }

  /**
   * Returns all workflow definitions created.
   */
  async getAllWorkflows(): Promise<Workflow[]> {
    return Object
      .entries(await this.getWorkflowsAggregate())
      .map(([, workflow]) => workflow);
  }

  /**
   * Subscribes to ALL events emitted in the event store. This is a volatile subscription which means
   * that past events are ignored and only events are emitted that were dispatched after subscription.
   * @param eventHandler Event handler.
   */
  async subscribeToAll(eventHandler: (eventType: string, eventData: unknown) => void): Promise<void> {
    const subscription = eventStore.subscribeToAll({ fromPosition: "end" });
    this.subscriptions.push(subscription);
    for await (const { event } of subscription) {
      if (event == null) {
        continue;
      }

      const eventType = event.type;
      const eventData = event.data as unknown;

      eventHandler(eventType, eventData);
    }
  }

  /** @inheritDoc */
  async onModuleDestroy() {
    this.logger.log(`Unsubscribing from ${this.subscriptions.length} event streams`);
    await Promise.all(this.subscriptions.map(async (curr) => await curr.unsubscribe()));

    this.logger.log(`Disable and delete all used projections`);
    if (await this.existsProjection(WORKFLOWS_PROJECTION_NAME)) {
      await eventStore.disableProjection(WORKFLOWS_PROJECTION_NAME);
      await eventStore.deleteProjection(WORKFLOWS_PROJECTION_NAME);
    }
    if (await this.existsProjection(WORKFLOW_INSTANCES_PROJECTION_NAME)) {
      await eventStore.disableProjection(WORKFLOW_INSTANCES_PROJECTION_NAME);
      await eventStore.deleteProjection(WORKFLOW_INSTANCES_PROJECTION_NAME);
    }
  }

  /**
   * Returns the projected aggregate of all workflows.
   * @private
   */
  private async getWorkflowsAggregate(): Promise<Record<string, Workflow>> {
    return await eventStore.getProjectionResult<Record<string, Workflow>>(WORKFLOWS_PROJECTION_NAME) ?? {};
  }

  /**
   * Returns the projected aggregate of all workflow instances.
   * @private
   */
  private async getWorkflowInstancesAggregate(): Promise<Record<string, WorkflowInstance>> {
    return await eventStore.getProjectionResult<Record<string, WorkflowInstance>>(WORKFLOW_INSTANCES_PROJECTION_NAME) ?? {};
  }

  /**
   * Appends a single event to the stream with the given name.
   * @param streamName Stream name.
   * @param event Event data.
   */
  private async appendToStream(streamName: string, event: { type: string, data: any, metadata?: MetadataType }): Promise<void> {
    this.logger.debug(`Write to stream "${streamName}": ${JSON.stringify(event)}`);
    return await hideInternalType(eventStore.appendToStream(streamName, jsonEvent(event)));
  }

  /**
   * Reads all events from the stream with the given name.
   * @param streamName Stream name.
   */
  private async readStream(streamName: string) {
    this.logger.debug(`Read all events from stream "${streamName}"`);
    return eventStore.readStream(streamName, {
      direction: "forwards",
      fromRevision: "start",
      maxCount: 1000
    });
  }

  /**
   * Checks if the projection with the given name already exists.
   * @param projectionName Name of the projection to be checked.
   */
  private async existsProjection(projectionName: string): Promise<boolean> {
    const projections = await eventStore.listProjections();
    for await (const projection of projections) {
      if (projection.name === projectionName) {
        return true;
      }
    }
    return false;
  }
}
