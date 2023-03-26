import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { JSONPath } from "jsonpath-plus";
import { Subject } from "rxjs";
import { evaluateObjectDefinition, EVENT_NAME_EXTERNAL_PARTICIPANT_ACK_PREFIX } from "src/workflow/converter";
import { State } from "xstate";
import { PersistenceService } from "../persistence";
import * as persistenceEvents from "../persistence/persistence.events";
import {
  ExternalWorkflowInstanceTransition,
  OriginatingParticipant,
  SupportedWorkflowModels,
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
  WorkflowProposalRuleServiceDenial,
  WorkflowService
} from "../workflow";
import * as consistencyEvents from "./consistency.actions";

import { ConsistencyMessage } from "./models";
import { ConsistencyStrategy } from "./strategies";
import { ofConsistencyMessage } from "./utils";


/**
 * Use this token as provider token to create an injectable instance for some consistency strategy.
 */
export const CONSISTENCY_STRATEGY_PROVIDER_TOKEN = "CONSISTENCY_STRATEGY";

const RECIPIENT_ORGANIZATION_ID = "ORGANIZATION_ID";
const RECIPIENT_WORKFLOW_ID = "WORKFLOW_ID";
const RECIPIENT_WORKFLOW_INSTANCE_ID = "WORKFLOW_INSTANCE_ID";

/**
 * Service that connects to the consistency stack to publish and receive messages. Most parameters for this
 * service can be configured in the gateways environment.
 */
@Injectable()
export class ConsistencyService implements OnModuleInit {

  private readonly log = new Logger(ConsistencyService.name);
  readonly actions$: Subject<ConsistencyMessage<unknown>>;

  constructor(@Inject(CONSISTENCY_STRATEGY_PROVIDER_TOKEN) private readonly consistencyStrategy: ConsistencyStrategy,
              private persistence: PersistenceService,
              private workflowService: WorkflowService) {
    this.actions$ = this.consistencyStrategy.actions$;
    this.log.log(`Using "${this.consistencyStrategy.constructor.name}" as consistency strategy implementation`);
    if (this.actions$ == null) {
      this.log.error(`Actions stream for provided consistency strategy is undefined. Please provide an appropriate stream implementation.`);
    }
  }

  /** @inheritDoc */
  onModuleInit() {
    this.persistence.subscribeToAll(async (eventType: string, eventData: unknown) => {
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
        await this.dispatch(consistencyEvents.acceptWorkflowInstance({
          id: approval.id,
          workflowId: approval.proposal.workflowId,
          organizationId: approval.proposal.organizationId,
          proposal: approval.proposal
        }));
      }

      if (persistenceEvents.receivedWorkflowInstanceRejectedByRuleService.sameAs(eventType)) {
        const denial = eventData as WorkflowInstanceRuleServiceDenial;
        await this.dispatch(consistencyEvents.rejectWorkflowInstance({
          id: denial.id,
          workflowId: denial.proposal.workflowId,
          organizationId: denial.proposal.organizationId,
          proposal: denial.proposal,
          reasons: denial.validationErrors.map((curr) => curr.reason)
        }));
      }

      // Interaction with participants regarding workflow instance transitions
      if (persistenceEvents.localTransitionAcceptedByRuleService.sameAs(eventType)) {
        const approval = eventData as WorkflowInstanceTransitionRuleServiceApproval;

        const transition = approval.transition;
        const workflow = await this.workflowService.getWorkflow(approval.workflowId);
        const transitions = await this.getExternalTransitions(transition, workflow.workflowModel);

        await Promise.all(transitions.map(t => this.dispatch(consistencyEvents.advanceWorkflowInstance(t))));
      }

      if (persistenceEvents.receivedTransitionAcceptedByRuleService.sameAs(eventType)) {
        const approval = eventData as WorkflowInstanceTransitionRuleServiceApproval;
        const originatingParticipant = approval.transition.originatingExternalTransition.originatingParticipant
        await this.dispatch(consistencyEvents.acceptTransition({
          id: originatingParticipant.workflowInstanceId,
          workflowId: originatingParticipant.workflowId,
          transition: approval.transition.originatingExternalTransition,
          organizationId: originatingParticipant.organizationId,
          originatingParticipant: {
            organizationId: this.consistencyStrategy.getOrganizationIdentifier(),
            workflowId: approval.workflowId,
            workflowInstanceId: approval.id,
            externalIdentifier: originatingParticipant.externalIdentifier
          }
        }));
      }

      if (persistenceEvents.receivedTransitionRejectedByRuleService.sameAs(eventType)) {
        const denial = eventData as WorkflowInstanceTransitionRuleServiceDenial;
        const originatingParticipant = denial.transition.originatingExternalTransition.originatingParticipant
        await this.dispatch(consistencyEvents.rejectTransition({
          id: originatingParticipant.workflowInstanceId,
          workflowId: originatingParticipant.workflowId,
          organizationId: this.consistencyStrategy.getOrganizationIdentifier(),
          transition: denial.transition.originatingExternalTransition,
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
      .subscribe(({
                    payload,
                    commitmentReference
                  }) => this.onParticipantAcceptedWorkflow(payload, commitmentReference));
    this.actions$
      .pipe(ofConsistencyMessage(consistencyEvents.rejectWorkflow))
      .subscribe(({
                    payload,
                    commitmentReference
                  }) => this.onParticipantRejectedWorkflow(payload, commitmentReference));

    // Messages dispatched by other participants regarding workflow instances
    this.actions$
      .pipe(ofConsistencyMessage(consistencyEvents.launchWorkflowInstance))
      .subscribe(({ payload, commitmentReference }) => this.onReceivedWorkflowInstance(payload, commitmentReference));
    this.actions$
      .pipe(ofConsistencyMessage(consistencyEvents.acceptWorkflowInstance))
      .subscribe(({
                    payload,
                    commitmentReference
                  }) => this.onParticipantAcceptedWorkflowInstance(payload, commitmentReference));
    this.actions$
      .pipe(ofConsistencyMessage(consistencyEvents.rejectWorkflowInstance))
      .subscribe(({
                    payload,
                    commitmentReference
                  }) => this.onParticipantRejectedWorkflowInstance(payload, commitmentReference));

    // Messages dispatched by other participants regarding workflow instance transitions
    this.actions$
      .pipe(ofConsistencyMessage(consistencyEvents.advanceWorkflowInstance))
      .subscribe(({
                    payload,
                    commitmentReference
                  }) => this.onAdvanceExternalWorkflowInstance(payload, commitmentReference));
    this.actions$
      .pipe(ofConsistencyMessage(consistencyEvents.acceptTransition))
      .subscribe(({
                    payload,
                    commitmentReference
                  }) => this.onParticipantAcceptedTransition(payload, commitmentReference));
    this.actions$
      .pipe(ofConsistencyMessage(consistencyEvents.rejectTransition))
      .subscribe(({
                    payload,
                    commitmentReference
                  }) => this.onParticipantRejectedTransition(payload, commitmentReference));

  }

  private async getExternalTransitions(transition: WorkflowInstanceTransition, workflowModel: SupportedWorkflowModels): Promise<ExternalWorkflowInstanceTransition[]> {
    const isCurrentStateExternal = typeof (transition.to) !== "string" && typeof (transition.to.value) !== "string";

    const previousStateName = typeof(transition.from) === "string" ? transition.from : Object.keys(transition.from.value)[0];
    const currentStateName = typeof(transition.to) === "string" ? transition.to : Object.keys(transition.to.value)[0];

    // if we are not entering a new external state => return
    if (!isCurrentStateExternal || previousStateName === currentStateName) {
      return [];
    }

    const currentState = transition.to as State<any, any>;
    const stateDefinition = workflowModel.activities[currentStateName];

    if (!stateDefinition.external) {
      return [];
    }

    const UUIDV4_REGEX = /^\\w{8}-\\w{4}-\\w{4}-\\w{4}-\\w{12}$/;

    const jsonPathContext = { context: currentState.context };

    return stateDefinition.externalParticipants.map(ep => {
      const rawOrganizationId = ep.recipientInfo[RECIPIENT_ORGANIZATION_ID];
      const organizationId = JSONPath({ path: rawOrganizationId, json: jsonPathContext, wrap: false }) ?? rawOrganizationId;

      const rawWorkflowId = ep.recipientInfo[RECIPIENT_WORKFLOW_ID];
      const workflowId = UUIDV4_REGEX.test(rawWorkflowId)
        ? rawWorkflowId
        : JSONPath({ path: rawWorkflowId, json: jsonPathContext, wrap: false });

      const rawWorkflowInstanceId = ep.recipientInfo[RECIPIENT_WORKFLOW_INSTANCE_ID];
      let instanceId: string;
      if (rawWorkflowInstanceId != null) {
        instanceId = UUIDV4_REGEX.test(rawOrganizationId)
          ? rawOrganizationId
          : JSONPath({ path: rawWorkflowInstanceId, json: jsonPathContext, wrap: false });
      }

      const payload = ep.payload != null ? evaluateObjectDefinition(ep.payload, jsonPathContext) : undefined;

      const originatingParticipant = {
        externalIdentifier: ep.id,
        organizationId: this.consistencyStrategy.getOrganizationIdentifier(),
        workflowId: transition.workflowId,
        workflowInstanceId: transition.id
      } as OriginatingParticipant;

      return {
        organizationId,
        workflowId,
        instanceId,
        externalIdentifier: ep.id,
        event: ep.event,
        payload,
        originatingParticipant
      } as ExternalWorkflowInstanceTransition;
    });
  }

  /**
   * Some counterparty wants to create a new workflow definition.
   * @param proposal
   * @param commitmentReference
   * @private
   */
  private async onReceivedWorkflow(proposal: WorkflowProposal, commitmentReference: string) {
    await this.persistence.dispatchWorkflowEvent(proposal.consistencyId, persistenceEvents.receivedWorkflow({
      ...proposal,
      commitmentReference
    }));
  }

  /**
   * Some counterparty accepted the proposed workflow definition.
   * @param approval
   * @param commitmentReference
   * @private
   */
  private async onParticipantAcceptedWorkflow(approval: WorkflowProposalParticipantApproval, commitmentReference: string) {
    await this.persistence.dispatchWorkflowEvent(approval.id, persistenceEvents.workflowAcceptedByParticipant({
      ...approval,
      commitmentReference
    }));
    // Dispatch the follow up event if ALL required parties accepted
    await this.persistence.dispatchWorkflowEvent(approval.id, persistenceEvents.workflowAccepted({
      ...approval,
      commitmentReference
    }));
  }

  /**
   * Some counterparty rejected the proposed workflow definition.
   * @param denial
   * @param commitmentReference
   * @private
   */
  private async onParticipantRejectedWorkflow(denial: WorkflowProposalParticipantDenial, commitmentReference: string) {
    await this.persistence.dispatchWorkflowEvent(denial.id, persistenceEvents.workflowRejectedByParticipant({
      ...denial,
      commitmentReference
    }));
    // Dispatch the follow up event if ANY of the parties rejected
    await this.persistence.dispatchWorkflowEvent(denial.id, persistenceEvents.workflowRejected({
      ...denial,
      commitmentReference
    }));
  }

  /**
   * Some counterparty wants to create a new workflow instance.
   * @param proposal
   * @param commitmentReference
   * @private
   */
  private async onReceivedWorkflowInstance(proposal: WorkflowInstanceProposal, commitmentReference: string) {
    await this.persistence.dispatchInstanceEvent(proposal.consistencyId, persistenceEvents.receivedWorkflowInstance({
      ...proposal,
      commitmentReference
    }));
  }

  /**
   * Some counterparty accepted the proposed workflow instance.
   * @param approval
   * @param commitmentReference
   * @private
   */
  private async onParticipantAcceptedWorkflowInstance(approval: WorkflowInstanceParticipantApproval, commitmentReference: string) {
    await this.persistence.dispatchInstanceEvent(approval.id, persistenceEvents.workflowInstanceAcceptedByParticipant({
      ...approval,
      commitmentReference
    }));
    // Dispatch the follow up event if ALL required parties accepted
    await this.persistence.dispatchInstanceEvent(approval.id, persistenceEvents.workflowInstanceAccepted({
      ...approval,
      commitmentReference
    }));
  }

  /**
   * Some counterparty rejected the proposed workflow instance.
   * @param denial
   * @param commitmentReference
   * @private
   */
  private async onParticipantRejectedWorkflowInstance(denial: WorkflowInstanceParticipantDenial, commitmentReference: string) {
    await this.persistence.dispatchInstanceEvent(denial.id, persistenceEvents.workflowInstanceRejectedByParticipant({
      ...denial,
      commitmentReference
    }));
    // Dispatch the follow up event if ANY of the parties rejected
    await this.persistence.dispatchInstanceEvent(denial.id, persistenceEvents.workflowInstanceRejected({
      ...denial,
      commitmentReference
    }));
  }

  /**
   * Some counterparty wants to advance a certain workflow instance from one state to another.
   * @param transition
   * @param commitmentReference
   * @private
   */
  private async onAdvanceExternalWorkflowInstance(transition: ExternalWorkflowInstanceTransition, commitmentReference: string) {
    this.log.debug(`Received external transition:`, transition);

    const workflow = await this.persistence.getWorkflowById(transition.workflowId);
    if (workflow == null) {
      return this.dispatch(consistencyEvents.rejectTransition({
        id: transition.originatingParticipant.workflowInstanceId,
        workflowId: transition.originatingParticipant.workflowId,
        organizationId: this.consistencyStrategy.getOrganizationIdentifier(),
        transition: transition,
        commitmentReference,
        reasons: [`Workflow with ID "${transition.workflowId}" does not exist`]
      }));
    }

    let workflowInstance: WorkflowInstance;
    if (transition.instanceId != null) {
      workflowInstance = await this.persistence.getWorkflowInstanceById(transition.workflowId, transition.instanceId);
      if (workflowInstance == null) {
        return this.dispatch(consistencyEvents.rejectTransition({
          id: transition.originatingParticipant.workflowInstanceId,
          workflowId: transition.originatingParticipant.workflowId,
          organizationId: this.consistencyStrategy.getOrganizationIdentifier(),
          transition: transition,
          commitmentReference,
          reasons: [`Instance with ID "${transition.instanceId}" does not exist`]
        }));
      }
    } else {
      workflowInstance = await this.workflowService.launchWorkflowInstance(transition.workflowId);
      // TODO: wait for the localWorkflowInstanceAccepted event before processing the transition and sending an ack/nack response
    }

    try {
      await this.workflowService.onExternalAdvanceWorkflowInstance(
        workflow,
        workflowInstance,
        { event: transition.event, payload: transition.payload },
        transition
      );
    } catch (ex: unknown) {
      this.log.error(ex);

      if (ex instanceof Error) {
        return this.dispatch(consistencyEvents.rejectTransition({
          id: transition.originatingParticipant.workflowInstanceId,
          workflowId: transition.originatingParticipant.workflowId,
          organizationId: this.consistencyStrategy.getOrganizationIdentifier(),
          transition: transition,
          commitmentReference,
          reasons: [`An error occurred: ${ex.message}`]
        }));
      }
    }
  }

  /**
   * Accepts external state transition.
   * @param approval
   * @param commitmentReference
   * @private
   */
  private async onParticipantAcceptedTransition(approval: WorkflowInstanceTransitionParticipantApproval, commitmentReference: string) {
    const ackTransitionName = `${EVENT_NAME_EXTERNAL_PARTICIPANT_ACK_PREFIX}${approval.transition.originatingParticipant.externalIdentifier}`;
    await this.workflowService.onExternalTransitionAcknowledge(approval.workflowId, approval.id, { event: ackTransitionName }, approval.originatingParticipant);

    await this.persistence.dispatchTransitionEvent(approval.id, persistenceEvents.transitionAcceptedByParticipant({
      ...approval,
      commitmentReference
    }));

    // TODO: Dispatch the follow up event if ALL required parties accepted
    await this.persistence.dispatchTransitionEvent(approval.id, persistenceEvents.transitionAccepted({
      ...approval,
      commitmentReference
    }));
  }

  /**
   * Rejects external state transition.
   * @param denial
   * @param commitmentReference
   * @private
   */
  private async onParticipantRejectedTransition(denial: WorkflowInstanceTransitionParticipantDenial, commitmentReference: string) {
    await this.persistence.dispatchTransitionEvent(denial.id, persistenceEvents.transitionRejectedByParticipant({
      ...denial,
      commitmentReference
    }));

    // Dispatch the follow up event if ANY of the parties rejected
    await this.persistence.dispatchTransitionEvent(denial.id, persistenceEvents.transitionRejected({
      ...denial,
      commitmentReference
    }));
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
