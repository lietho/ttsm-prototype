import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AllStreamResolvedEvent, jsonEvent, MetadataType, StreamSubscription } from '@eventstore/db-client';
import {
  Workflow,
  WorkflowInstance,
  WorkflowInstanceParticipantApproval,
  WorkflowInstanceParticipantDenial,
  WorkflowInstanceProposal,
  WorkflowInstanceRuleServiceApproval,
  WorkflowInstanceRuleServiceDenial,
  WorkflowInstanceTransition,
  WorkflowInstanceTransitionParticipantApproval,
  WorkflowInstanceTransitionParticipantDenial,
  WorkflowInstanceTransitionRuleServiceApproval,
  WorkflowInstanceTransitionRuleServiceDenial,
  WorkflowProposal,
  WorkflowProposalParticipantApproval,
  WorkflowProposalParticipantDenial,
  WorkflowProposalRuleServiceApproval,
  WorkflowProposalRuleServiceDenial
} from '../workflow';
import { RuleService } from '../rules';
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
            "${eventTypes.proposeWorkflowReceived.type}": (s, e) => { s.workflows[e.data.consistencyId] = { ...s.workflows[e.data.consistencyId], ...e.data }; },
            "${eventTypes.proposeWorkflowAcceptedByRuleService.type}": (s, e) => {
              if (s.workflows[e.data.id].acceptedByRuleServices !== false) {
                s.workflows[e.data.id].acceptedByRuleServices = true;
              }
            },
            "${eventTypes.proposeWorkflowRejectedByRuleService.type}": (s, e) => { s.workflows[e.data.id].acceptedByRuleServices = false; },
            "${eventTypes.proposeWorkflowAcceptedByParticipant.type}": (s, e) => {
              if (s.workflows[e.data.id].acceptedByParticipants !== false) {
                s.workflows[e.data.id].acceptedByParticipants = true;
              }
            },
            "${eventTypes.proposeWorkflowRejectedByParticipant.type}": (s, e) => { s.workflows[e.data.id].acceptedByParticipants = false; },
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
            "${eventTypes.launchWorkflowInstanceReceived.type}": (s, e) => { s.instances[e.data.consistencyId] = { ...s.instances[e.data.consistencyId], ...e.data }; },
            "${eventTypes.launchWorkflowInstanceAcceptedByRuleService.type}": (s, e) => {
              if (s.instances[e.data.id].acceptedByRuleServices !== false) {
                s.instances[e.data.id].acceptedByRuleServices = true;
              }
            },
            "${eventTypes.launchWorkflowInstanceRejectedByRuleService.type}": (s, e) => { s.instances[e.data.id].acceptedByRuleServices = false; },
            "${eventTypes.launchWorkflowInstanceAcceptedByParticipant.type}": (s, e) => {
              if (s.instances[e.data.id].acceptedByParticipants !== false) {
                s.instances[e.data.id].acceptedByParticipants = true;
              }
            },
            "${eventTypes.launchWorkflowInstanceRejectedByParticipant.type}": (s, e) => { s.instances[e.data.id].acceptedByParticipants = false; },
            "${eventTypes.advanceWorkflowInstance.type}": (s, e) => { s.instances[e.data.id].currentState = e.data.to; },
            "${eventTypes.advanceWorkflowInstanceReceived.type}": (s, e) => {
              s.instances[e.data.id].currentState = e.data.to;
              s.instances[e.data.id].commitmentReference = e.data.commitmentReference;
              s.instances[e.data.id].acceptedByParticipants = undefined;
            },
            "${eventTypes.advanceWorkflowInstanceAcceptedByParticipant.type}": (s, e) => {
              if (s.instances[e.data.id].acceptedByParticipants !== false) {
                s.instances[e.data.id].acceptedByParticipants = true;
              }
            },
            "${eventTypes.advanceWorkflowInstanceRejectedByParticipant.type}": (s, e) => {
              s.instances[e.data.id].currentState = e.data.from;
              s.instances[e.data.id].commitmentReference = e.data.commitmentReference;
              s.instances[e.data.id].acceptedByParticipants = true;
            },
            "${eventTypes.advanceWorkflowInstanceAcceptedByRuleService.type}": (s, e) => {
              if (s.instances[e.data.id].acceptedByRuleServices !== false) {
                s.instances[e.data.id].acceptedByRuleServices = true;
              }
            },
            "${eventTypes.advanceWorkflowInstanceRejectedByRuleService.type}": (s, e) => { s.instances[e.data.id].acceptedByRuleServices = false; }
        })
        .transformBy((state) => state.instances)
        .outputState();
  `;

  private readonly ruleServicesProjectionName = 'custom-projections.rules.' + randomUUIDv4();
  private readonly ruleServicesProjection = `
    fromAll()
        .when({
            $init: () => ({ services: {} }),
            "${eventTypes.registerRuleService.type}": (s, e) => { s.services[e.data.id] = e.data; },
            "${eventTypes.unregisterRuleService.type}": (s, e) => { delete s.services[e.data.id]; },
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

  /**
   * A new workflow proposal has been received.
   * @param proposal
   */
  async receiveWorkflow(proposal: WorkflowProposal) {
    return await this.appendToStream(`workflows.${proposal.consistencyId}`, eventTypes.proposeWorkflowReceived(proposal));
  }

  /**
   * The rule services approve the proposal.
   * @param approval
   */
  async workflowProposalAcceptedByRuleService(approval: WorkflowProposalRuleServiceApproval) {
    return await this.appendToStream(`workflows.${approval.id}`, eventTypes.proposeWorkflowAcceptedByRuleService(approval));
  }

  /**
   * The rule services rejected the proposal.
   * @param denial
   */
  async workflowProposalRejectedByRuleService(denial: WorkflowProposalRuleServiceDenial) {
    return await this.appendToStream(`workflows.${denial.id}`, eventTypes.proposeWorkflowRejectedByRuleService(denial));
  }

  /**
   * Accepts a proposed workflow from any of the participants.
   * @param acceptance
   */
  async workflowProposalAcceptedByParticipant(acceptance: WorkflowProposalParticipantApproval) {
    return await this.appendToStream(`workflows.${acceptance.id}`, eventTypes.proposeWorkflowAcceptedByParticipant(acceptance));
  }

  /**
   * Rejects a proposed workflow from any of the participants.
   * @param rejection
   */
  async workflowProposalRejectedByParticipant(rejection: WorkflowProposalParticipantDenial) {
    return await this.appendToStream(`workflows.${rejection.id}`, eventTypes.proposeWorkflowRejectedByParticipant(rejection));
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
    return await this.appendToStream(`instances.${proposal.consistencyId}`, eventTypes.launchWorkflowInstanceReceived(proposal));
  }

  /**
   * The rule services approve the workflow instance.
   * @param approval
   */
  async workflowInstanceAcceptedByRuleService(approval: WorkflowInstanceRuleServiceApproval) {
    return await this.appendToStream(`instances.${approval.id}`, eventTypes.launchWorkflowInstanceAcceptedByRuleService(approval));
  }

  /**
   * The rule services rejected the workflow instance.
   * @param denial
   */
  async workflowInstanceRejectedByRuleService(denial: WorkflowInstanceRuleServiceDenial) {
    return await this.appendToStream(`instances.${denial.id}`, eventTypes.launchWorkflowInstanceRejectedByRuleService(denial));
  }

  /**
   * Accepts a proposed workflow instance from any of the participants.
   * @param acceptance
   */
  async workflowInstanceAcceptedByParticipant(acceptance: WorkflowInstanceParticipantApproval) {
    return await this.appendToStream(`instances.${acceptance.id}`, eventTypes.launchWorkflowInstanceAcceptedByParticipant(acceptance));
  }

  /**
   * Rejects a proposed workflow instance from any of the participants.
   * @param rejection
   */
  async workflowInstanceRejectedByParticipant(rejection: WorkflowInstanceParticipantDenial) {
    return await this.appendToStream(`instances.${rejection.id}`, eventTypes.launchWorkflowInstanceRejectedByParticipant(rejection));
  }

  /**
   * Advances the state of a specific workflow instance.
   * @param transition
   */
  async advanceWorkflowInstanceState(transition: WorkflowInstanceTransition) {
    await this.appendToStream(`instances.${transition.id}`, eventTypes.advanceWorkflowInstance(transition));
  }

  /**
   * A new request to advance the workflow instance state has been received.
   * @param transition
   */
  async receiveAdvanceWorkflowInstanceState(transition: WorkflowInstanceTransition) {
    await this.appendToStream(`instances.${transition.id}`, eventTypes.advanceWorkflowInstanceReceived(transition));
  }

  /**
   * Accepts a state transition for a given workflow instance.
   * @param acceptance
   */
  async acceptAdvanceWorkflowInstance(acceptance: WorkflowInstanceTransitionParticipantApproval) {
    return await this.appendToStream(`instances.${acceptance.id}`, eventTypes.advanceWorkflowInstanceAcceptedByParticipant(acceptance));
  }

  /**
   * Rejects a state transition for a given workflow instance.
   * @param rejection
   */
  async rejectAdvanceWorkflowInstance(rejection: WorkflowInstanceTransitionParticipantDenial) {
    return await this.appendToStream(`instances.${rejection.id}`, eventTypes.advanceWorkflowInstanceRejectedByParticipant(rejection));
  }

  /**
   * The rule services approve the workflow instance state transition.
   * @param approval
   */
  async workflowInstanceTransitionAcceptedByRuleService(approval: WorkflowInstanceTransitionRuleServiceApproval) {
    return await this.appendToStream(`instances.${approval.id}`, eventTypes.advanceWorkflowInstanceAcceptedByRuleService(approval));
  }

  /**
   * The rule services rejected the workflow instance state transition.
   * @param denial
   */
  async workflowInstanceTransitionRejectedByRuleService(denial: WorkflowInstanceTransitionRuleServiceDenial) {
    return await this.appendToStream(`instances.${denial.id}`, eventTypes.advanceWorkflowInstanceRejectedByRuleService(denial));
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
        if (eventTypes.proposeWorkflowReceived.sameAs(eventType)) result = { ...result, ...(event.data as any as Workflow) };

        if (eventTypes.proposeWorkflowAcceptedByRuleService.sameAs(eventType) && result.acceptedByRuleServices !== false) result.acceptedByRuleServices = true;
        if (eventTypes.proposeWorkflowRejectedByRuleService.sameAs(eventType)) result.acceptedByRuleServices = false;
        if (eventTypes.proposeWorkflowAcceptedByParticipant.sameAs(eventType) && result.acceptedByParticipants !== false) result.acceptedByParticipants = true;
        if (eventTypes.proposeWorkflowRejectedByParticipant.sameAs(eventType)) result.acceptedByParticipants = false;
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
        if (eventTypes.launchWorkflowInstanceReceived.sameAs(eventType)) result = event.data as any as WorkflowInstance;

        if (eventTypes.launchWorkflowInstanceAcceptedByRuleService.sameAs(eventType) && result.acceptedByRuleServices !== false) result.acceptedByRuleServices = true;
        if (eventTypes.launchWorkflowInstanceRejectedByRuleService.sameAs(eventType)) result.acceptedByRuleServices = false;
        if (eventTypes.launchWorkflowInstanceAcceptedByParticipant.sameAs(eventType) && result.acceptedByParticipants !== false) result.acceptedByParticipants = true;
        if (eventTypes.launchWorkflowInstanceRejectedByParticipant.sameAs(eventType)) result.acceptedByParticipants = false;

        if (eventTypes.advanceWorkflowInstance.sameAs(eventType) && result != null) result.currentState = (event.data as unknown as WorkflowInstanceTransition).to;
        if (eventTypes.advanceWorkflowInstanceReceived.sameAs(eventType) && result != null) {
          const eventData = event.data as unknown as WorkflowInstanceTransition;
          result.currentState = eventData.to;
          result.commitmentReference = eventData.commitmentReference;
          result.acceptedByParticipants = undefined;
        }
        if (eventTypes.advanceWorkflowInstanceAcceptedByParticipant.sameAs(eventType) && result.acceptedByRuleServices !== false) {
          result.acceptedByParticipants = true;
        }
        if (eventTypes.advanceWorkflowInstanceRejectedByParticipant.sameAs(eventType) && result != null) {
          const eventData = event.data as unknown as WorkflowInstanceTransition;
          result.currentState = eventData.from;
          result.commitmentReference = eventData.commitmentReference;
          result.acceptedByParticipants = true;
        }

        if (eventTypes.advanceWorkflowInstanceAcceptedByRuleService.sameAs(eventType) && result.acceptedByRuleServices !== false) result.acceptedByRuleServices = true;
        if (eventTypes.advanceWorkflowInstanceRejectedByRuleService.sameAs(eventType)) result.acceptedByRuleServices = false;
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
    await this.appendToStream(`rules.${ruleService.name}`, eventTypes.registerRuleService(ruleServiceEntity));
    return ruleServiceEntity;
  }

  /**
   * Unregisters an existing rule service.
   * @param id
   */
  async unregisterRuleService(id: string) {
    return await this.appendToStream(`rules.${id}`, eventTypes.unregisterRuleService({ id }));
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
