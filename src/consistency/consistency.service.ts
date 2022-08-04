import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Subject } from 'rxjs';

import {
  ConsistencyMessage,
  WorkflowAcceptanceConsistencyMessage,
  WorkflowInstanceAcceptanceConsistencyMessage,
  WorkflowInstanceProposalConsistencyMessage,
  WorkflowInstanceRejectionConsistencyMessage,
  WorkflowInstanceStateAdvancementAcceptanceConsistencyMessage,
  WorkflowInstanceStateAdvancementConsistencyMessage,
  WorkflowInstanceStateAdvancementRejectionConsistencyMessage,
  WorkflowProposalConsistencyMessage,
  WorkflowRejectionConsistencyMessage
} from './models';
import { ConsistencyStrategy } from './strategies';
import { ofConsistencyMessage } from './utils';
import { PersistenceService } from '../persistence';
import * as consistencyEvents from './consistency.actions';
import * as persistenceEvents from '../persistence/persistence.events';


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

      if (persistenceEvents.proposeWorkflow.sameAs(eventType)) await this.dispatch(consistencyEvents.proposeWorkflow(eventData as WorkflowProposalConsistencyMessage));
      if (persistenceEvents.launchWorkflowInstance.sameAs(eventType)) await this.dispatch(consistencyEvents.launchWorkflowInstance(eventData as WorkflowInstanceProposalConsistencyMessage));
      if (persistenceEvents.advanceWorkflowInstanceState.sameAs(eventType)) await this.dispatch(consistencyEvents.advanceWorkflowInstance(eventData as WorkflowInstanceStateAdvancementConsistencyMessage));
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
  private async onExternalWorkflowProposal(proposal: WorkflowProposalConsistencyMessage, commitmentReference: string) {
    await this.persistence.receiveWorkflow({ ...proposal, commitmentReference });
    return await this.dispatch(consistencyEvents.acceptWorkflow({
      id: proposal.consistencyId,
      commitmentReference,
      proposal: proposal
    }));
  }

  /**
   * Some counterparty accepted the proposed workflow definition.
   * @param acceptance
   * @param commitmentReference
   * @private
   */
  private async onAcceptExternalWorkflowProposal(acceptance: WorkflowAcceptanceConsistencyMessage, commitmentReference: string) {
    return await this.persistence.acceptWorkflow({
      id: acceptance.id,
      commitmentReference,
      proposal: acceptance.proposal
    });
  }

  /**
   * Some counterparty rejected the proposed workflow definition.
   * @param rejection
   * @param commitmentReference
   * @private
   */
  private async onRejectExternalWorkflowProposal(rejection: WorkflowRejectionConsistencyMessage, commitmentReference: string) {
    return await this.persistence.rejectWorkflow({
      id: rejection.id,
      commitmentReference,
      proposal: rejection.proposal,
      reason: rejection.reason
    });
  }

  /**
   * Some counterparty wants to create a new workflow instance.
   * @param proposal
   * @param commitmentReference
   * @private
   */
  private async onExternalWorkflowInstanceProposal(proposal: WorkflowInstanceProposalConsistencyMessage, commitmentReference: string) {
    await this.persistence.receiveWorkflowInstance({ ...proposal, commitmentReference });
    return await this.dispatch(consistencyEvents.acceptWorkflowInstance({
      id: proposal.consistencyId,
      commitmentReference,
      proposal: proposal
    }));
  }

  /**
   * Some counterparty accepted the proposed workflow instance.
   * @param acceptance
   * @param commitmentReference
   * @private
   */
  private async onAcceptExternalWorkflowInstanceProposal(acceptance: WorkflowInstanceAcceptanceConsistencyMessage, commitmentReference: string) {
    return await this.persistence.acceptWorkflowInstance({
      id: acceptance.id,
      commitmentReference,
      proposal: acceptance.proposal
    });
  }

  /**
   * Some counterparty rejected the proposed workflow instance.
   * @param rejection
   * @param commitmentReference
   * @private
   */
  private async onRejectExternalWorkflowInstanceProposal(rejection: WorkflowInstanceRejectionConsistencyMessage, commitmentReference: string) {
    return await this.persistence.rejectWorkflowInstance({
      id: rejection.id,
      commitmentReference,
      proposal: rejection.proposal,
      reason: rejection.reason
    });
  }

  /**
   * Some counterparty wants to advance a certain workflow instance from one state to another.
   * @param advancement
   * @param commitmentReference
   * @private
   */
  private async onAdvanceExternalWorkflowInstance(advancement: WorkflowInstanceStateAdvancementConsistencyMessage, commitmentReference: string) {
    const workflowInstance = await this.persistence.getWorkflowInstanceById(advancement.id);
    if (workflowInstance == null) {
      return this.dispatch(consistencyEvents.rejectAdvanceWorkflowInstance({
        ...advancement, commitmentReference, reason: `Instance with ID "${advancement.id}" does not exist`
      }));
    }

    const workflow = await this.persistence.getWorkflowById(workflowInstance.workflowId);
    if (workflow == null) {
      return this.dispatch(consistencyEvents.rejectAdvanceWorkflowInstance({
        ...advancement, commitmentReference, reason: `Workflow with ID "${workflowInstance.workflowId}" does not exist`
      }));
    }

    return this.dispatch(consistencyEvents.acceptAdvanceWorkflowInstance({ ...advancement, commitmentReference }));
  }

  /**
   * Accepts external state transition.
   * @param rejection
   * @param commitmentReference
   * @private
   */
  private async onAcceptAdvanceExternalWorkflowInstance(rejection: WorkflowInstanceStateAdvancementAcceptanceConsistencyMessage, commitmentReference: string) {
    return await this.persistence.acceptAdvanceWorkflowInstance({ ...rejection, commitmentReference });
  }

  /**
   * Rejects external state transition.
   * @param rejection
   * @param commitmentReference
   * @private
   */
  private async onRejectAdvanceExternalWorkflowInstance(rejection: WorkflowInstanceStateAdvancementRejectionConsistencyMessage, commitmentReference: string) {
    return await this.persistence.rejectAdvanceWorkflowInstance({ ...rejection, commitmentReference });
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
