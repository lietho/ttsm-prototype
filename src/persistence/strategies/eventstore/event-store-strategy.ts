import { jsonEvent, MetadataType, StreamSubscription } from "@eventstore/db-client";
import { Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { randomUUIDv4 } from "src/core/utils";
import { environment } from "src/environment";
import * as eventTypes from "src/persistence/persistence.events";
import {
  Workflow,
  WorkflowInstance,
  WorkflowInstanceProposal,
  WorkflowInstanceTransition,
  WorkflowProposal
} from "src/workflow";
import {
  aggregateWorkflowEvents,
  aggregateWorkflowInstanceEvents,
  hideInternalType,
  PersistenceEvent
} from "../../utils";
import { PersistenceStrategy, StateTransition } from "../persistence-strategy";
import {
  client as eventStore,
  connect as connectToEventStore,
  WORKFLOW_INSTANCES_PROJECTION,
  WORKFLOW_INSTANCES_PROJECTION_NAME,
  WORKFLOWS_PROJECTION,
  WORKFLOWS_PROJECTION_NAME
} from "./eventstoredb";

export class EventStoreStrategy implements PersistenceStrategy, OnModuleInit, OnModuleDestroy {

  private readonly logger = new Logger(EventStoreStrategy.name);
  private readonly subscriptions: StreamSubscription[] = [];

  async onModuleInit() {
    this.logger.log(`Establishing connection to event store on "${environment.persistence.eventStore.serviceUrl}"`);
    await connectToEventStore();

    this.logger.log(`Creating event store projections: ${[WORKFLOWS_PROJECTION_NAME, WORKFLOW_INSTANCES_PROJECTION_NAME].join(", ")}`);
    await eventStore.createProjection(WORKFLOWS_PROJECTION_NAME, WORKFLOWS_PROJECTION);
    await eventStore.createProjection(WORKFLOW_INSTANCES_PROJECTION_NAME, WORKFLOW_INSTANCES_PROJECTION);
  }

  async proposeWorkflow(proposal: Omit<WorkflowProposal, "consistencyId">): Promise<Workflow> {
    const proposedWorkflow: Workflow = {
      ...proposal,
      consistencyId: randomUUIDv4()
    };
    await this.appendToStream(`workflows.${proposedWorkflow.consistencyId}`, eventTypes.proposeWorkflow(proposedWorkflow));
    return proposedWorkflow as Workflow;
  }

  async dispatchWorkflowEvent<T>(id: string, event: PersistenceEvent<T>): Promise<void> {
    return await this.appendToStream(`workflows.${id}`, event);
  }

  async launchWorkflowInstance(proposal: Omit<WorkflowInstanceProposal, "consistencyId">): Promise<WorkflowInstance> {
    const proposedWorkflowInstance: WorkflowInstance = {
      ...proposal,
      consistencyId: randomUUIDv4()
    };
    await this.appendToStream(`instances.${proposedWorkflowInstance.consistencyId}`, eventTypes.launchWorkflowInstance(proposedWorkflowInstance));
    return proposedWorkflowInstance as WorkflowInstance;
  }

  async dispatchInstanceEvent<T>(id: string, event: PersistenceEvent<T>): Promise<void> {
    return await this.appendToStream(`instances.${id}`, event);
  }

  async advanceWorkflowInstanceState(transition: WorkflowInstanceTransition): Promise<void> {
    await this.appendToStream(`instances.${transition.id}`, eventTypes.advanceWorkflowInstance(transition));
  }

  async getAllWorkflows(): Promise<Workflow[]> {
    return Object
      .entries(await this.getWorkflowsAggregate())
      .map(([, workflow]) => workflow);
  }

  async getWorkflowById(id: string): Promise<Workflow> {
    return (await this.getWorkflowsAggregate())[id];
  }

  async getWorkflowInstancesOfWorkflow(workflowId: string): Promise<WorkflowInstance[]> {
    return Object
      .entries(await this.getWorkflowInstancesAggregate())
      .filter(([, instance]) => instance.workflowId === workflowId)
      .map(([, instance]) => instance);
  }

  async getWorkflowInstanceById(id: string): Promise<WorkflowInstance> {
    return (await this.getWorkflowInstancesAggregate())[id];
  }

  async getWorkflowStateAt(id: string, at: Date): Promise<Workflow | null> {
    const eventStream = await this.readStream(`workflows.${id}`);
    try {
      const events = [];
      for await (const { event } of eventStream) {
        if (event.created.getTime() > at.getTime()) {
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
        if (event.created.getTime() > at.getTime()) {
          break;
        }
        events.push(event);
      }

      return aggregateWorkflowInstanceEvents(events);
    } catch (e) {
      return null;
    }
  }

  async getWorkflowInstanceStateTransitionPayloadsUntil(id: string, until: Date): Promise<StateTransition[] | null> {
    const result: StateTransition[] = [];
    const events = await this.readStream(`instances.${id}`);
    try {
      for await (const { event } of events) {
        if (event.created.getTime() > until.getTime()) {
          break;
        }
        if (!eventTypes.advanceWorkflowInstance.sameAs(event.type)) {
          continue;
        }
        const stateMachineEvent = event.data as unknown as WorkflowInstanceTransition;
        result.push({
          event: stateMachineEvent.event,
          timestamp: event.created.toISOString(),
          payload: stateMachineEvent.payload
        });
      }
    } catch (e) {
      return null;
    }
    return result;
  }

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