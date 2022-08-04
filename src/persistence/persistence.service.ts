import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AllStreamResolvedEvent, jsonEvent, MetadataType, StreamSubscription } from '@eventstore/db-client';
import {
  Workflow,
  WorkflowAcceptance,
  WorkflowInstance,
  WorkflowInstanceAcceptance,
  WorkflowInstanceProposal,
  WorkflowInstanceRejection,
  WorkflowInstanceStateAdvancement,
  WorkflowInstanceStateAdvancementAcceptance,
  WorkflowInstanceStateAdvancementRejection,
  WorkflowProposal,
  WorkflowRejection
} from '../workflow/models';
import * as eventTypes from './persistence.events';

import { client as eventStore, connect as connectToEventStore } from './eventstoredb';
import { environment } from '../environment';
import { randomUUIDv4 } from '../core/utils';

/**
 * Adapter service for third party event sourcing services.
 */
@Injectable()
export class PersistenceService implements OnModuleInit, OnModuleDestroy {

  private readonly logger = new Logger(PersistenceService.name);
  private readonly subscriptions: StreamSubscription[] = [];

  private readonly workflowsProjectionName = 'custom-projections.workflows.' + randomUUIDv4();
  private readonly workflowsProjection = `
    fromAll()
        .when({
            $init: () => ({ workflows: {} }),
            "${eventTypes.proposeWorkflow.type}": (s, e) => { s.workflows[e.data.consistencyId] = e.data; },
            "${eventTypes.receiveWorkflow.type}": (s, e) => { s.workflows[e.data.consistencyId] = e.data; },
            "${eventTypes.rejectWorkflow.type}": (s, e) => { delete s.workflows[e.data.consistencyId]; },
        })
        .transformBy((state) => state.workflows)
        .outputState();
  `;

  private readonly workflowInstancesProjectionName = 'custom-projections.instances.' + randomUUIDv4();
  private readonly workflowInstancesProjection = `
    fromAll()
        .when({
            $init: () => ({ instances: {} }),
            "${eventTypes.launchWorkflowInstance.type}": (s, e) => { s.instances[e.data.consistencyId] = e.data; },
            "${eventTypes.receiveWorkflowInstance.type}": (s, e) => { s.instances[e.data.consistencyId] = e.data; },
            "${eventTypes.rejectWorkflowInstance.type}": (s, e) => { delete s.instances[e.data.consistencyId]; },
            "${eventTypes.advanceWorkflowInstanceState.type}": (s, e) => { s.instances[e.data.id].currentState = e.data.to; }
            "${eventTypes.rejectAdvanceWorkflowInstanceState.type}": (s, e) => { s.instances[e.data.id].currentState = e.data.from; }
        })
        .transformBy((state) => state.instances)
        .outputState();
  `;

  /** @inheritDoc */
  async onModuleInit() {
    this.logger.log(`Establishing connection to event store on "${environment.persistenceServiceUrl}"`);
    await connectToEventStore();

    this.logger.log(`Creating event store projections: ${[this.workflowsProjectionName, this.workflowInstancesProjectionName].join(', ')}`);
    await eventStore.createProjection(this.workflowsProjectionName, this.workflowsProjection);
    await eventStore.createProjection(this.workflowInstancesProjectionName, this.workflowInstancesProjection);
  }

  /** @inheritDoc */
  async onModuleDestroy() {
    this.logger.log(`Unsubscribing from ${this.subscriptions.length} event streams`);
    await Promise.all(this.subscriptions.map(async (curr) => await curr.unsubscribe()));

    this.logger.log(`Disable and delete all used projections`);
    if (await this.existsProjection(this.workflowsProjectionName)) {
      await eventStore.disableProjection(this.workflowsProjectionName);
      await eventStore.deleteProjection(this.workflowsProjectionName);
    }
    if (await this.existsProjection(this.workflowInstancesProjectionName)) {
      await eventStore.disableProjection(this.workflowInstancesProjectionName);
      await eventStore.deleteProjection(this.workflowInstancesProjectionName);
    }
  }

  /**
   * Proposes a new workflow to all participants.
   * @param proposal
   */
  async proposeWorkflow(proposal: Omit<WorkflowProposal, 'consistencyId'>) {
    const proposedWorkflow: Workflow = {
      ...proposal,
      consistencyId: randomUUIDv4()
    };
    await this.appendToStream(`workflows.${proposedWorkflow.consistencyId}`, eventTypes.proposeWorkflow(proposedWorkflow));
    return proposedWorkflow as Workflow;
  }

  /**
   * A new workflow proposal has been received.
   * @param proposal
   */
  async receiveWorkflow(proposal: WorkflowProposal) {
    return await this.appendToStream(`workflows.${proposal.consistencyId}`, eventTypes.receiveWorkflow(proposal));
  }

  /**
   * Accepts a proposed workflow from any of the participants.
   * @param acceptance
   */
  async acceptWorkflow(acceptance: WorkflowAcceptance) {
    return await this.appendToStream(`workflows.${acceptance.id}`, eventTypes.acceptWorkflow(acceptance));
  }

  /**
   * Rejects a proposed workflow from any of the participants.
   * @param rejection
   */
  async rejectWorkflow(rejection: WorkflowRejection) {
    return await this.appendToStream(`workflows.${rejection.id}`, eventTypes.rejectWorkflow(rejection));
  }

  /**
   * Launches a new instances of a certain workflow.
   * @param proposal
   */
  async launchWorkflowInstance(proposal: Omit<WorkflowInstanceProposal, 'consistencyId'>) {
    const proposedWorkflowInstance: WorkflowInstance = {
      ...proposal,
      consistencyId: randomUUIDv4()
    };
    await this.appendToStream(`instances.${proposedWorkflowInstance.consistencyId}`, eventTypes.launchWorkflowInstance(proposedWorkflowInstance));
    return proposedWorkflowInstance as WorkflowInstance;
  }

  /**
   * A new workflow instance proposal has been received.
   * @param proposal
   */
  async receiveWorkflowInstance(proposal: WorkflowInstanceProposal) {
    return await this.appendToStream(`instances.${proposal.consistencyId}`, eventTypes.receiveWorkflowInstance(proposal));
  }

  /**
   * Accepts a proposed workflow instance from any of the participants.
   * @param acceptance
   */
  async acceptWorkflowInstance(acceptance: WorkflowInstanceAcceptance) {
    return await this.appendToStream(`instances.${acceptance.id}`, eventTypes.acceptWorkflowInstance(acceptance));
  }

  /**
   * Rejects a proposed workflow instance from any of the participants.
   * @param rejection
   */
  async rejectWorkflowInstance(rejection: WorkflowInstanceRejection) {
    return await this.appendToStream(`instances.${rejection.id}`, eventTypes.rejectWorkflowInstance(rejection));
  }

  /**
   * Advances the state of a specific workflow instance.
   * @param advancement
   */
  async advanceWorkflowInstanceState(advancement: WorkflowInstanceStateAdvancement) {
    await this.appendToStream(`instances.${advancement.id}`, eventTypes.advanceWorkflowInstanceState(advancement));
  }

  /**
   * Accepts a state transition for a given workflow instance.
   * @param acceptance
   */
  async acceptAdvanceWorkflowInstance(acceptance: WorkflowInstanceStateAdvancementAcceptance) {
    return await this.appendToStream(`instances.${acceptance.id}`, eventTypes.acceptAdvanceWorkflowInstanceState(acceptance));
  }

  /**
   * Rejects a state transition for a given workflow instance.
   * @param rejection
   */
  async rejectAdvanceWorkflowInstance(rejection: WorkflowInstanceStateAdvancementRejection) {
    return await this.appendToStream(`instances.${rejection.id}`, eventTypes.rejectAdvanceWorkflowInstanceState(rejection));
  }

  async getWorkflowStateAt(id: string, at: Date) {
    let result: Workflow = null;
    const events = await this.readStream(`workflows.${id}`);
    try {
      for await (const { event } of events) {
        const timestamp = new Date(event.created / 10000);
        if (timestamp.getTime() > at.getTime()) {
          break;
        }
        const eventType = event?.type;
        if (eventTypes.proposeWorkflow.sameAs(eventType)) result = event.data as any as Workflow;
        if (eventTypes.receiveWorkflow.sameAs(eventType)) result = event.data as any as Workflow;
        if (eventTypes.rejectWorkflow.sameAs(eventType)) result = null;
      }
    } catch (e) {
      return null;
    }
    return result;
  }

  async getWorkflowInstanceStateAt(id: string, at: Date) {
    let result: WorkflowInstance = null;
    const events = await this.readStream(`instances.${id}`);
    try {
      for await (const { event } of events) {
        const timestamp = new Date(event.created / 10000);
        if (timestamp.getTime() > at.getTime()) {
          break;
        }
        const eventType = event?.type;
        if (eventTypes.launchWorkflowInstance.sameAs(eventType)) result = event.data as any as WorkflowInstance;
        if (eventTypes.receiveWorkflowInstance.sameAs(eventType)) result = event.data as any as WorkflowInstance;
        if (eventTypes.rejectWorkflowInstance.sameAs(eventType)) result = null;
        if (eventTypes.advanceWorkflowInstanceState.sameAs(eventType) && result != null) result.currentState = (event.data as unknown as WorkflowInstanceStateAdvancement).to;
        if (eventTypes.rejectAdvanceWorkflowInstanceState.sameAs(eventType) && result != null) result.currentState = (event.data as unknown as WorkflowInstanceStateAdvancement).from;
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
  async getWorkflowById(id: string) {
    return (await this.getWorkflowsAggregate())[id];
  }

  /**
   * Returns the workflow instance with the given ID.
   * @param id Workflow instance ID.
   */
  async getWorkflowInstanceById(id: string) {
    return (await this.getWorkflowInstancesAggregate())[id];
  }

  /**
   * Returns all workflow instances of the given workflow.
   * @param workflowId Workflow ID.
   */
  async getWorkflowInstancesOfWorkflow(workflowId: string) {
    return Object
      .entries(await this.getWorkflowInstancesAggregate())
      .filter(([, instance]) => instance.workflowId === workflowId)
      .map(([, instance]) => instance);
  }

  /**
   * Returns all workflow definitions created.
   */
  async getAllWorkflows() {
    return Object
      .entries(await this.getWorkflowsAggregate())
      .map(([, workflow]) => workflow);
  }

  /**
   * Returns all workflow instances launched.
   */
  async getAllWorkflowInstances() {
    return Object
      .entries(await this.getWorkflowInstancesAggregate())
      .map(([, instance]) => instance);
  }

  /**
   * Returns the projected aggregate of all workflows.
   * @private
   */
  private async getWorkflowsAggregate() {
    return await eventStore.getProjectionResult<Record<string, Workflow>>(this.workflowsProjectionName) ?? {};
  }

  /**
   * Returns the projected aggregate of all workflow instances.
   * @private
   */
  private async getWorkflowInstancesAggregate() {
    return await eventStore.getProjectionResult<Record<string, WorkflowInstance>>(this.workflowInstancesProjectionName) ?? {};
  }

  /**
   * Appends a single event to the stream with the given name.
   * @param streamName Stream name.
   * @param event Event data.
   */
  async appendToStream(streamName: string, event: { type: string, data: any, metadata?: MetadataType }) {
    this.logger.debug(`Write to stream "${streamName}": ${JSON.stringify(event)}`);
    return await eventStore.appendToStream(streamName, jsonEvent(event));
  }

  /**
   * Reads all events from all streams.
   */
  async readAll() {
    this.logger.debug(`Read all events from all streams`);
    return eventStore.readAll({
      direction: 'forwards',
      fromPosition: 'start',
      maxCount: 1000
    });
  }

  /**
   * Reads all events from the stream with the given name.
   * @param streamName Stream name.
   */
  async readStream(streamName: string) {
    this.logger.debug(`Read all events from stream "${streamName}"`);
    return eventStore.readStream(streamName, {
      direction: 'forwards',
      fromRevision: 'start',
      maxCount: 1000
    });
  }

  /**
   * Reads all events backwards from the stream with the given name. Reading backwards
   * means that the events are traversed from the end of the stream towards the beginning.
   * @param streamName Stream name.
   */
  async readStreamBackwards(streamName: string) {
    this.logger.debug(`Read all events backwards from stream "${streamName}"`);
    return eventStore.readStream(streamName, {
      direction: 'backwards',
      fromRevision: 'end',
      maxCount: 1000
    });
  }

  async existsProjection(projectionName: string) {
    const projections = await eventStore.listProjections();
    for await (const projection of projections) {
      if (projection.name === projectionName) {
        return true;
      }
    }
    return false;
  }

  async subscribeToAll(eventHandler: (resolvedEvent: AllStreamResolvedEvent) => void) {
    const subscription = eventStore.subscribeToAll({ fromPosition: 'end' });
    this.subscriptions.push(subscription);
    for await (const resolvedEvent of subscription) {
      eventHandler(resolvedEvent);
    }
  }
}
