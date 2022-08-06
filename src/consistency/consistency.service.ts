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
  WorkflowInstanceTransition,
  WorkflowInstanceTransitionParticipantApproval,
  WorkflowInstanceTransitionParticipantDenial,
  WorkflowInstanceTransitionRuleServiceApproval,
  WorkflowProposal,
  WorkflowProposalParticipantApproval,
  WorkflowProposalParticipantDenial,
  WorkflowProposalRuleServiceApproval
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

      if (persistenceEvents.proposeWorkflowAcceptedByRuleService.sameAs(eventType)) {
        const approval = eventData as WorkflowProposalRuleServiceApproval;
        await this.dispatch(consistencyEvents.proposeWorkflow({ ...approval.proposal }));
      }

      if (persistenceEvents.launchWorkflowInstanceAcceptedByRuleService.sameAs(eventType)) {
        const approval = eventData as WorkflowInstanceRuleServiceApproval;
        await this.dispatch(consistencyEvents.launchWorkflowInstance({ ...approval.proposal }));
      }

      if (persistenceEvents.advanceWorkflowInstanceAcceptedByRuleService.sameAs(eventType)) {
        const approval = eventData as WorkflowInstanceTransitionRuleServiceApproval;
        await this.dispatch(consistencyEvents.advanceWorkflowInstance({ ...approval.transition }));
      }
    });

    this.actions$
      .pipe(ofConsistencyMessage(consistencyEvents.proposeWorkflow))
      .subscribe(({ payload, commitmentReference }) => this.onExternalWorkflowProposal(payload, commitmentReference));
    this.actions$
      .pipe(ofConsistencyMessage(consistencyEvents.acceptWorkflow))
      .subscribe(({ payload, commitmentReference }) => this.onAcceptExternalWorkflowProposal(payload, commitmentReference));
    this.actions$
      .pipe(ofConsistencyMessage(consistencyEvents.rejectWorkflow))
      .subscribe(({ payload, commitmentReference }) => this.onRejectExternalWorkflowProposal(payload, commitmentReference));

    this.actions$
      .pipe(ofConsistencyMessage(consistencyEvents.launchWorkflowInstance))
      .subscribe(({ payload, commitmentReference }) => this.onExternalWorkflowInstanceProposal(payload, commitmentReference));
    this.actions$
      .pipe(ofConsistencyMessage(consistencyEvents.acceptWorkflowInstance))
      .subscribe(({ payload, commitmentReference }) => this.onAcceptExternalWorkflowInstanceProposal(payload, commitmentReference));
    this.actions$
      .pipe(ofConsistencyMessage(consistencyEvents.rejectWorkflowInstance))
      .subscribe(({ payload, commitmentReference }) => this.onRejectExternalWorkflowInstanceProposal(payload, commitmentReference));

    this.actions$
      .pipe(ofConsistencyMessage(consistencyEvents.advanceWorkflowInstance))
      .subscribe(({ payload, commitmentReference }) => this.onAdvanceExternalWorkflowInstance(payload, commitmentReference));
    this.actions$
      .pipe(ofConsistencyMessage(consistencyEvents.acceptAdvanceWorkflowInstance))
      .subscribe(({ payload, commitmentReference }) => this.onAcceptAdvanceExternalWorkflowInstance(payload, commitmentReference));
    this.actions$
      .pipe(ofConsistencyMessage(consistencyEvents.rejectAdvanceWorkflowInstance))
      .subscribe(({ payload, commitmentReference }) => this.onRejectAdvanceExternalWorkflowInstance(payload, commitmentReference));

  }

  /**
   * Some counterparty wants to create a new workflow definition.
   * @param proposal
   * @param commitmentReference
   * @private
   */
  private async onExternalWorkflowProposal(proposal: WorkflowProposal, commitmentReference: string) {
    await this.persistence.receiveWorkflow({ ...proposal, commitmentReference });
    return await this.dispatch(consistencyEvents.acceptWorkflow({
      id: proposal.consistencyId,
      commitmentReference,
      proposal: proposal
    }));
  }

  /**
   * Some counterparty accepted the proposed workflow definition.
   * @param approval
   * @param commitmentReference
   * @private
   */
  private async onAcceptExternalWorkflowProposal(approval: WorkflowProposalParticipantApproval, commitmentReference: string) {
    return await this.persistence.workflowProposalAcceptedByParticipant({
      id: approval.id,
      commitmentReference,
      proposal: approval.proposal
    });
  }

  /**
   * Some counterparty rejected the proposed workflow definition.
   * @param denial
   * @param commitmentReference
   * @private
   */
  private async onRejectExternalWorkflowProposal(denial: WorkflowProposalParticipantDenial, commitmentReference: string) {
    return await this.persistence.workflowProposalRejectedByParticipant({
      id: denial.id,
      commitmentReference,
      proposal: denial.proposal,
      reason: denial.reason
    });
  }

  /**
   * Some counterparty wants to create a new workflow instance.
   * @param proposal
   * @param commitmentReference
   * @private
   */
  private async onExternalWorkflowInstanceProposal(proposal: WorkflowInstanceProposal, commitmentReference: string) {
    await this.persistence.receiveWorkflowInstance({ ...proposal, commitmentReference });
    return await this.dispatch(consistencyEvents.acceptWorkflowInstance({
      id: proposal.consistencyId,
      commitmentReference,
      proposal: proposal
    }));
  }

  /**
   * Some counterparty accepted the proposed workflow instance.
   * @param approval
   * @param commitmentReference
   * @private
   */
  private async onAcceptExternalWorkflowInstanceProposal(approval: WorkflowInstanceParticipantApproval, commitmentReference: string) {
    return await this.persistence.workflowInstanceAcceptedByParticipant({
      id: approval.id,
      commitmentReference,
      proposal: approval.proposal
    });
  }

  /**
   * Some counterparty rejected the proposed workflow instance.
   * @param denial
   * @param commitmentReference
   * @private
   */
  private async onRejectExternalWorkflowInstanceProposal(denial: WorkflowInstanceParticipantDenial, commitmentReference: string) {
    return await this.persistence.workflowInstanceRejectedByParticipant({
      id: denial.id,
      commitmentReference,
      proposal: denial.proposal,
      reason: denial.reason
    });
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
      return this.dispatch(consistencyEvents.rejectAdvanceWorkflowInstance({
        id: transition.id,
        transition: transition,
        commitmentReference,
        reason: `Instance with ID "${transition.id}" does not exist`
      }));
    }

    const workflow = await this.persistence.getWorkflowById(workflowInstance.workflowId);
    if (workflow == null) {
      return this.dispatch(consistencyEvents.rejectAdvanceWorkflowInstance({
        id: transition.id,
        transition: transition,
        commitmentReference,
        reason: `Workflow with ID "${workflowInstance.workflowId}" does not exist`
      }));
    }

    await this.persistence.receiveAdvanceWorkflowInstanceState({ ...transition, commitmentReference });
    return this.dispatch(consistencyEvents.acceptAdvanceWorkflowInstance({
      id: transition.id,
      transition,
      commitmentReference
    }));
  }

  /**
   * Accepts external state transition.
   * @param approval
   * @param commitmentReference
   * @private
   */
  private async onAcceptAdvanceExternalWorkflowInstance(approval: WorkflowInstanceTransitionParticipantApproval, commitmentReference: string) {
    return await this.persistence.acceptAdvanceWorkflowInstance({
      id: approval.id,
      commitmentReference,
      transition: approval.transition
    });
  }

  /**
   * Rejects external state transition.
   * @param denial
   * @param commitmentReference
   * @private
   */
  private async onRejectAdvanceExternalWorkflowInstance(denial: WorkflowInstanceTransitionParticipantDenial, commitmentReference: string) {
    return await this.persistence.rejectAdvanceWorkflowInstance({
      id: denial.id,
      transition: denial.transition,
      commitmentReference,
      reason: denial.reason
    });
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
