import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AllStreamResolvedEvent, jsonEvent, MetadataType, StreamSubscription } from '@eventstore/db-client';
import { Workflow, WorkflowInstance, WorkflowInstanceProposal, WorkflowInstanceTransition, WorkflowProposal } from '../workflow';
import { RuleService } from '../rules';
import * as eventTypes from './persistence.events';
import * as ruleEventTypes from '../rules/rules.events';

import { client as eventStore, connect as connectToEventStore } from './eventstoredb';
import { environment } from '../environment';
import { randomUUIDv4 } from '../core/utils';
import { PersistenceEvent } from './utils';

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
            "${eventTypes.receivedWorkflow.type}": (s, e) => { s.workflows[e.data.consistencyId] = { ...s.workflows[e.data.consistencyId], ...e.data }; },
            "${eventTypes.localWorkflowAcceptedByRuleService.type}": (s, e) => {
              if (s.workflows[e.data.id].acceptedByRuleServices !== false) {
                s.workflows[e.data.id].acceptedByRuleServices = true;
              }
            },
            "${eventTypes.localWorkflowRejectedByRuleService.type}": (s, e) => { s.workflows[e.data.id].acceptedByRuleServices = false; },
            "${eventTypes.workflowAccepted.type}": (s, e) => {
              if (s.workflows[e.data.id].acceptedByParticipants !== false) {
                s.workflows[e.data.id].acceptedByParticipants = true;
              }
            },
            "${eventTypes.workflowRejected.type}": (s, e) => { s.workflows[e.data.id].acceptedByParticipants = false; },
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
            "${eventTypes.receivedWorkflowInstance.type}": (s, e) => { s.instances[e.data.consistencyId] = { ...s.instances[e.data.consistencyId], ...e.data }; },
            "${eventTypes.localWorkflowInstanceAcceptedByRuleService.type}": (s, e) => {
              if (s.instances[e.data.id].acceptedByRuleServices !== false) {
                s.instances[e.data.id].acceptedByRuleServices = true;
              }
            },
            "${eventTypes.localWorkflowInstanceRejectedByRuleService.type}": (s, e) => { s.instances[e.data.id].acceptedByRuleServices = false; },
            "${eventTypes.workflowInstanceAccepted.type}": (s, e) => {
              if (s.instances[e.data.id].acceptedByParticipants !== false) {
                s.instances[e.data.id].acceptedByParticipants = true;
              }
            },
            "${eventTypes.workflowInstanceRejected.type}": (s, e) => { s.instances[e.data.id].acceptedByParticipants = false; },
            "${eventTypes.advanceWorkflowInstance.type}": (s, e) => { s.instances[e.data.id].currentState = e.data.to; },
            "${eventTypes.receivedTransition.type}": (s, e) => {
              s.instances[e.data.id].currentState = e.data.to;
              s.instances[e.data.id].commitmentReference = e.data.commitmentReference;
              s.instances[e.data.id].acceptedByParticipants = undefined;
            },
            "${eventTypes.transitionAccepted.type}": (s, e) => {
              if (s.instances[e.data.id].acceptedByParticipants !== false) {
                s.instances[e.data.id].acceptedByParticipants = true;
              }
            },
            "${eventTypes.transitionRejected.type}": (s, e) => {
              s.instances[e.data.id].currentState = e.data.from;
              s.instances[e.data.id].commitmentReference = e.data.commitmentReference;
              s.instances[e.data.id].acceptedByParticipants = true;
            },
            "${eventTypes.localTransitionAcceptedByRuleService.type}": (s, e) => {
              if (s.instances[e.data.id].acceptedByRuleServices !== false) {
                s.instances[e.data.id].acceptedByRuleServices = true;
              }
            },
            "${eventTypes.localTransitionRejectedByRuleService.type}": (s, e) => { s.instances[e.data.id].acceptedByRuleServices = false; }
        })
        .transformBy((state) => state.instances)
        .outputState();
  `;

  private readonly ruleServicesProjectionName = 'custom-projections.rules.' + randomUUIDv4();
  private readonly ruleServicesProjection = `
    fromAll()
        .when({
            $init: () => ({ services: {} }),
            "${ruleEventTypes.registerRuleService.type}": (s, e) => { s.services[e.data.id] = e.data; },
            "${ruleEventTypes.unregisterRuleService.type}": (s, e) => { delete s.services[e.data.id]; },
        })
        .transformBy((state) => state.services)
        .outputState();
  `;

  /** @inheritDoc */
  async onModuleInit() {
    this.logger.log(`Establishing connection to event store on "${environment.persistenceServiceUrl}"`);
    await connectToEventStore();

    this.logger.log(`Creating event store projections: ${[this.workflowsProjectionName, this.workflowInstancesProjectionName, this.ruleServicesProjectionName].join(', ')}`);
    await eventStore.createProjection(this.workflowsProjectionName, this.workflowsProjection);
    await eventStore.createProjection(this.workflowInstancesProjectionName, this.workflowInstancesProjection);
    await eventStore.createProjection(this.ruleServicesProjectionName, this.ruleServicesProjection);
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
    if (await this.existsProjection(this.ruleServicesProjectionName)) {
      await eventStore.disableProjection(this.ruleServicesProjectionName);
      await eventStore.deleteProjection(this.ruleServicesProjectionName);
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

  async dispatchWorkflowEvent<T>(id: string, event: PersistenceEvent<T>) {
    return await this.appendToStream(`workflows.${id}`, event);
  }

  async dispatchInstanceEvent<T>(id: string, event: PersistenceEvent<T>) {
    return await this.appendToStream(`instances.${id}`, event);
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
   * Advances the state of a specific workflow instance.
   * @param transition
   */
  async advanceWorkflowInstanceState(transition: WorkflowInstanceTransition) {
    await this.appendToStream(`instances.${transition.id}`, eventTypes.advanceWorkflowInstance(transition));
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
        if (eventTypes.receivedWorkflow.sameAs(eventType)) result = { ...result, ...(event.data as any as Workflow) };

        if (eventTypes.localWorkflowAcceptedByRuleService.sameAs(eventType) && result.acceptedByRuleServices !== false) result.acceptedByRuleServices = true;
        if (eventTypes.localWorkflowRejectedByRuleService.sameAs(eventType)) result.acceptedByRuleServices = false;
        if (eventTypes.workflowAccepted.sameAs(eventType) && result.acceptedByParticipants !== false) result.acceptedByParticipants = true;
        if (eventTypes.workflowRejected.sameAs(eventType)) result.acceptedByParticipants = false;
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
        if (eventTypes.receivedWorkflowInstance.sameAs(eventType)) result = event.data as any as WorkflowInstance;

        if (eventTypes.localWorkflowInstanceAcceptedByRuleService.sameAs(eventType) && result.acceptedByRuleServices !== false) result.acceptedByRuleServices = true;
        if (eventTypes.localWorkflowInstanceRejectedByRuleService.sameAs(eventType)) result.acceptedByRuleServices = false;
        if (eventTypes.workflowInstanceAccepted.sameAs(eventType) && result.acceptedByParticipants !== false) result.acceptedByParticipants = true;
        if (eventTypes.workflowInstanceRejected.sameAs(eventType)) result.acceptedByParticipants = false;

        if (eventTypes.advanceWorkflowInstance.sameAs(eventType) && result != null) result.currentState = (event.data as unknown as WorkflowInstanceTransition).to;
        if (eventTypes.receivedTransition.sameAs(eventType) && result != null) {
          const eventData = event.data as unknown as WorkflowInstanceTransition;
          result.currentState = eventData.to;
          result.commitmentReference = eventData.commitmentReference;
          result.acceptedByParticipants = undefined;
        }
        if (eventTypes.transitionAccepted.sameAs(eventType) && result.acceptedByRuleServices !== false) {
          result.acceptedByParticipants = true;
        }
        if (eventTypes.transitionRejected.sameAs(eventType) && result != null) {
          const eventData = event.data as unknown as WorkflowInstanceTransition;
          result.currentState = eventData.from;
          result.commitmentReference = eventData.commitmentReference;
          result.acceptedByParticipants = true;
        }

        if (eventTypes.localTransitionAcceptedByRuleService.sameAs(eventType) && result.acceptedByRuleServices !== false) result.acceptedByRuleServices = true;
        if (eventTypes.localTransitionRejectedByRuleService.sameAs(eventType)) result.acceptedByRuleServices = false;
      }
    } catch (e) {
      return null;
    }
    return result;
  }

  /**
   * Returns all payloads attached to state transitions until the given point in time.
   * @param id Workflow instance ID.
   * @param until Point in time until which should be search.
   */
  async getWorkflowInstanceStateTransitionPayloadsUntil(id: string, until: Date) {
    const result: { event: string, timestamp: string, payload: any }[] = [];
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
        result.push({ event: stateMachineEvent.event, timestamp: timestamp.toISOString(), payload: stateMachineEvent.payload });
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
   * Returns a registered rule service by its ID.
   * @param id
   */
  async getRegisteredRuleServiceById(id: string) {
    return (await this.getRuleServicesAggregate())[id];
  }

  /**
   * Returns all rule services registered.
   */
  async getAllRegisteredRuleServices() {
    return Object
      .entries(await this.getRuleServicesAggregate())
      .map(([, ruleService]) => ruleService);
  }

  /**
   * Registers a new rule service.
   * @param ruleService
   */
  async registerRuleService(ruleService: Omit<RuleService, 'id'>) {
    const ruleServiceEntity: RuleService = { ...ruleService, id: randomUUIDv4() };
    await this.appendToStream(`rules.${ruleService.name}`, ruleEventTypes.registerRuleService(ruleServiceEntity));
    return ruleServiceEntity;
  }

  /**
   * Unregisters an existing rule service.
   * @param id
   */
  async unregisterRuleService(id: string) {
    return await this.appendToStream(`rules.${id}`, ruleEventTypes.unregisterRuleService({ id }));
  }

  /**
   * Returns the projected aggregate of all rule services.
   * @private
   */
  private async getRuleServicesAggregate() {
    return await eventStore.getProjectionResult<Record<string, RuleService>>(this.ruleServicesProjectionName) ?? {};
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
   * Checks if the projection with the given name already exists.
   * @param projectionName Name of the projection to be checked.
   */
  async existsProjection(projectionName: string) {
    const projections = await eventStore.listProjections();
    for await (const projection of projections) {
      if (projection.name === projectionName) {
        return true;
      }
    }
    return false;
  }

  /**
   * Subscribes to ALL events emitted in the event store. This is a volatile subscription which means
   * that past events are ignored and only events are emitted that were dispatched after subscription.
   * @param eventHandler Event handler.
   */
  async subscribeToAll(eventHandler: (resolvedEvent: AllStreamResolvedEvent) => void) {
    const subscription = eventStore.subscribeToAll({ fromPosition: 'end' });
    this.subscriptions.push(subscription);
    for await (const resolvedEvent of subscription) {
      eventHandler(resolvedEvent);
    }
  }
}
