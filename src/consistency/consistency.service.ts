import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Subject } from 'rxjs';

import { ConsistencyMessage } from './models';
import { ConsistencyStrategy } from './strategies';
import { ofConsistencyMessage } from './utils';
import { PersistenceService } from '../persistence';
import * as consistencyEvents from './consistency.actions';
import * as persistenceEvents from '../persistence/persistence.events';
import {
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


/**
 * Use this token as provider token to create an injectable instance for some consistency strategy.
 */
export const CONSISTENCY_STRATEGY_PROVIDER_TOKEN = 'CONSISTENCY_STRATEGY';

/**
 * Service that connects to the consistency stack to publish and receive messages. Most parameters for this
 * service can be configured in the gateways environment.
 */
@Injectable()
export class ConsistencyService implements ConsistencyStrategy, OnModuleInit {

  private readonly log = new Logger(ConsistencyService.name);
  readonly actions$: Subject<ConsistencyMessage<unknown>>;

  constructor(@Inject(CONSISTENCY_STRATEGY_PROVIDER_TOKEN) private readonly consistencyStrategy: ConsistencyStrategy,
              private persistence: PersistenceService) {
    this.actions$ = this.consistencyStrategy.actions$;
    this.log.log(`Using "${this.consistencyStrategy.constructor.name}" as consistency strategy implementation`);
    if (this.actions$ == null) {
      this.log.error(`Actions stream for provided consistency strategy is undefined. Please provide an appropriate stream implementation.`);
    }
  }

  /** @inheritDoc */
  onModuleInit() {
    this.persistence.subscribeToAll(async (resolvedEvent) => {
      const { event } = resolvedEvent;
      if (event == null) return;

      const eventType = event?.type;
      const eventData = event.data as unknown;

      // Interaction with participants regarding workflow specifications
      if (persistenceEvents.localWorkflowAcceptedByRuleService.sameAs(eventType)) {
        const approval = eventData as WorkflowProposalRuleServiceApproval;
        await this.dispatch(consistencyEvents.proposeWorkflow({ ...approval.proposal }));
      }

      if (persistenceEvents.receivedWorkflowAcceptedByRuleService.sameAs(eventType)) {
        const approval = eventData as WorkflowProposalRuleServiceApproval;
        await this.dispatch(consistencyEvents.acceptWorkflow({ id: approval.id, proposal: approval.proposal }));
      }

      if (persistenceEvents.receivedWorkflowRejectedByRuleService.sameAs(eventType)) {
        const denial = eventData as WorkflowProposalRuleServiceDenial;
        await this.dispatch(consistencyEvents.rejectWorkflow({
          id: denial.id,
          proposal: denial.proposal,
          reasons: denial.validationErrors.map((curr) => curr.reason)
        }));
      }

      // Interaction with participants regarding workflow instances
      if (persistenceEvents.localWorkflowInstanceAcceptedByRuleService.sameAs(eventType)) {
        const approval = eventData as WorkflowInstanceRuleServiceApproval;
        await this.dispatch(consistencyEvents.launchWorkflowInstance({ ...approval.proposal }));
      }

      if (persistenceEvents.receivedWorkflowInstanceAcceptedByRuleService.sameAs(eventType)) {
        const approval = eventData as WorkflowInstanceRuleServiceApproval;
        await this.dispatch(consistencyEvents.acceptWorkflowInstance({ id: approval.id, proposal: approval.proposal }));
      }

      if (persistenceEvents.receivedWorkflowInstanceRejectedByRuleService.sameAs(eventType)) {
        const denial = eventData as WorkflowInstanceRuleServiceDenial;
        await this.dispatch(consistencyEvents.rejectWorkflowInstance({
          id: denial.id,
          proposal: denial.proposal,
          reasons: denial.validationErrors.map((curr) => curr.reason)
        }));
      }

      // Interaction with participants regarding workflow instance transitions
      if (persistenceEvents.localTransitionAcceptedByRuleService.sameAs(eventType)) {
        const approval = eventData as WorkflowInstanceTransitionRuleServiceApproval;
        await this.dispatch(consistencyEvents.advanceWorkflowInstance({ ...approval.transition }));
      }

      if (persistenceEvents.receivedTransitionAcceptedByRuleService.sameAs(eventType)) {
        const approval = eventData as WorkflowInstanceTransitionRuleServiceApproval;
        await this.dispatch(consistencyEvents.acceptTransition({ id: approval.id, transition: approval.transition }));
      }

      if (persistenceEvents.receivedTransitionRejectedByRuleService.sameAs(eventType)) {
        const denial = eventData as WorkflowInstanceTransitionRuleServiceDenial;
        await this.dispatch(consistencyEvents.rejectTransition({
          id: denial.id,
          transition: denial.transition,
          reasons: denial.validationErrors.map((curr) => curr.reason)
        }));
      }
    });

    // Messages dispatched by other participants regarding workflow specifications
    this.actions$
      .pipe(ofConsistencyMessage(consistencyEvents.proposeWorkflow))
      .subscribe(({ payload, commitmentReference }) => this.onReceivedWorkflow(payload, commitmentReference));
    this.actions$
      .pipe(ofConsistencyMessage(consistencyEvents.acceptWorkflow))
      .subscribe(({ payload, commitmentReference }) => this.onParticipantAcceptedWorkflow(payload, commitmentReference));
    this.actions$
      .pipe(ofConsistencyMessage(consistencyEvents.rejectWorkflow))
      .subscribe(({ payload, commitmentReference }) => this.onParticipantRejectedWorkflow(payload, commitmentReference));

    // Messages dispatched by other participants regarding workflow instances
    this.actions$
      .pipe(ofConsistencyMessage(consistencyEvents.launchWorkflowInstance))
      .subscribe(({ payload, commitmentReference }) => this.onReceivedWorkflowInstance(payload, commitmentReference));
    this.actions$
      .pipe(ofConsistencyMessage(consistencyEvents.acceptWorkflowInstance))
      .subscribe(({ payload, commitmentReference }) => this.onParticipantAcceptedWorkflowInstance(payload, commitmentReference));
    this.actions$
      .pipe(ofConsistencyMessage(consistencyEvents.rejectWorkflowInstance))
      .subscribe(({ payload, commitmentReference }) => this.onParticipantRejectedWorkflowInstance(payload, commitmentReference));

    // Messages dispatched by other participants regarding workflow instance transitions
    this.actions$
      .pipe(ofConsistencyMessage(consistencyEvents.advanceWorkflowInstance))
      .subscribe(({ payload, commitmentReference }) => this.onAdvanceExternalWorkflowInstance(payload, commitmentReference));
    this.actions$
      .pipe(ofConsistencyMessage(consistencyEvents.acceptTransition))
      .subscribe(({ payload, commitmentReference }) => this.onParticipantAcceptedTransition(payload, commitmentReference));
    this.actions$
      .pipe(ofConsistencyMessage(consistencyEvents.rejectTransition))
      .subscribe(({ payload, commitmentReference }) => this.onParticipantRejectedTransition(payload, commitmentReference));

  }

  /**
   * Some counterparty wants to create a new workflow definition.
   * @param proposal
   * @param commitmentReference
   * @private
   */
  private async onReceivedWorkflow(proposal: WorkflowProposal, commitmentReference: string) {
    await this.persistence.dispatchWorkflowEvent(proposal.consistencyId, persistenceEvents.receivedWorkflow({ ...proposal, commitmentReference }));
  }

  /**
   * Some counterparty accepted the proposed workflow definition.
   * @param approval
   * @param commitmentReference
   * @private
   */
  private async onParticipantAcceptedWorkflow(approval: WorkflowProposalParticipantApproval, commitmentReference: string) {
    await this.persistence.dispatchWorkflowEvent(approval.id, persistenceEvents.workflowAcceptedByParticipant({ ...approval, commitmentReference }));
    // Dispatch the follow up event if ALL required parties accepted
    await this.persistence.dispatchWorkflowEvent(approval.id, persistenceEvents.workflowAccepted({ ...approval, commitmentReference }));
  }

  /**
   * Some counterparty rejected the proposed workflow definition.
   * @param denial
   * @param commitmentReference
   * @private
   */
  private async onParticipantRejectedWorkflow(denial: WorkflowProposalParticipantDenial, commitmentReference: string) {
    await this.persistence.dispatchWorkflowEvent(denial.id, persistenceEvents.workflowRejectedByParticipant({ ...denial, commitmentReference }));
    // Dispatch the follow up event if ANY of the parties rejected
    await this.persistence.dispatchWorkflowEvent(denial.id, persistenceEvents.workflowRejected({ ...denial, commitmentReference }));
  }

  /**
   * Some counterparty wants to create a new workflow instance.
   * @param proposal
   * @param commitmentReference
   * @private
   */
  private async onReceivedWorkflowInstance(proposal: WorkflowInstanceProposal, commitmentReference: string) {
    await this.persistence.dispatchInstanceEvent(proposal.consistencyId, persistenceEvents.receivedWorkflowInstance({ ...proposal, commitmentReference }));
  }

  /**
   * Some counterparty accepted the proposed workflow instance.
   * @param approval
   * @param commitmentReference
   * @private
   */
  private async onParticipantAcceptedWorkflowInstance(approval: WorkflowInstanceParticipantApproval, commitmentReference: string) {
    await this.persistence.dispatchInstanceEvent(approval.id, persistenceEvents.workflowInstanceAcceptedByParticipant({ ...approval, commitmentReference }));
    // Dispatch the follow up event if ALL required parties accepted
    await this.persistence.dispatchInstanceEvent(approval.id, persistenceEvents.workflowInstanceAccepted({ ...approval, commitmentReference }));
  }

  /**
   * Some counterparty rejected the proposed workflow instance.
   * @param denial
   * @param commitmentReference
   * @private
   */
  private async onParticipantRejectedWorkflowInstance(denial: WorkflowInstanceParticipantDenial, commitmentReference: string) {
    await this.persistence.dispatchInstanceEvent(denial.id, persistenceEvents.workflowInstanceRejectedByParticipant({ ...denial, commitmentReference }));
    // Dispatch the follow up event if ANY of the parties rejected
    await this.persistence.dispatchInstanceEvent(denial.id, persistenceEvents.workflowInstanceRejected({ ...denial, commitmentReference }));
  }

  /**
   * Some counterparty wants to advance a certain workflow instance from one state to another.
   * @param transition
   * @param commitmentReference
   * @private
   */
  private async onAdvanceExternalWorkflowInstance(transition: WorkflowInstanceTransition, commitmentReference: string) {
    const workflowInstance = await this.persistence.getWorkflowInstanceById(transition.id);
    if (workflowInstance == null) {
      return this.dispatch(consistencyEvents.rejectTransition({
        id: transition.id,
        transition: transition,
        commitmentReference,
        reasons: [`Instance with ID "${transition.id}" does not exist`]
      }));
    }

    const workflow = await this.persistence.getWorkflowById(workflowInstance.workflowId);
    if (workflow == null) {
      return this.dispatch(consistencyEvents.rejectTransition({
        id: transition.id,
        transition: transition,
        commitmentReference,
        reasons: [`Workflow with ID "${workflowInstance.workflowId}" does not exist`]
      }));
    }

    await this.persistence.dispatchInstanceEvent(transition.id, persistenceEvents.receivedTransition({ ...transition, commitmentReference }));
  }

  /**
   * Accepts external state transition.
   * @param approval
   * @param commitmentReference
   * @private
   */
  private async onParticipantAcceptedTransition(approval: WorkflowInstanceTransitionParticipantApproval, commitmentReference: string) {
    await this.persistence.dispatchInstanceEvent(approval.id, persistenceEvents.transitionAcceptedByParticipant({ ...approval, commitmentReference }));
    // Dispatch the follow up event if ALL required parties accepted
    await this.persistence.dispatchInstanceEvent(approval.id, persistenceEvents.transitionAccepted({ ...approval, commitmentReference }));
  }

  /**
   * Rejects external state transition.
   * @param denial
   * @param commitmentReference
   * @private
   */
  private async onParticipantRejectedTransition(denial: WorkflowInstanceTransitionParticipantDenial, commitmentReference: string) {
    await this.persistence.dispatchInstanceEvent(denial.id, persistenceEvents.transitionRejectedByParticipant({ ...denial, commitmentReference }));
    // Dispatch the follow up event if ANY of the parties rejected
    await this.persistence.dispatchInstanceEvent(denial.id, persistenceEvents.transitionRejected({ ...denial, commitmentReference }));
  }

  /** @inheritDoc */
  async getStatus() {
    if (this.consistencyStrategy == null) {
      this.log.error(`No consistency strategy attached, use the provider token "${CONSISTENCY_STRATEGY_PROVIDER_TOKEN}" to inject a strategy`);
      return null;
    }
    return this.consistencyStrategy.getStatus();
  }

  /** @inheritDoc */
  async dispatch<T>(msg: ConsistencyMessage<T>) {
    if (this.consistencyStrategy == null) {
      this.log.error(`No consistency strategy attached, use the provider token "${CONSISTENCY_STRATEGY_PROVIDER_TOKEN}" to inject a strategy`);
      return null;
    }
    return this.consistencyStrategy.dispatch(msg);
  }
}
