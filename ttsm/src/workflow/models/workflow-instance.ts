import { State } from "xstate";
import { ConsistencyEntity } from "../../consistency";
import { RuleServiceResponse } from "../../rules";
import {
  Commitment,
  WorkflowInstanceTransitionParticipantApproval,
  WorkflowInstanceTransitionParticipantDenial
} from "./workflow-instance-transition";

/**
 * The derived status of a workflow instance.
 */
export type WorkflowInstanceStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

export interface WorkflowInstanceContext {
  workflowId: string;
  id: string;
  organizationId: string;
}

export interface WorkflowInstance extends ConsistencyEntity, WorkflowInstanceContext {
  workflowId: string;
  currentState?: State<any, any>;
  acceptedByRuleServices?: boolean;
  acceptedByParticipants?: boolean;
  participantsAccepted?: (WorkflowInstanceTransitionParticipantApproval | WorkflowInstanceParticipantApproval)[];
  participantsRejected?: (WorkflowInstanceTransitionParticipantDenial | WorkflowInstanceParticipantDenial)[];
}

/**
 * Contains all information that is required to launch a new workflow instance.
 */
export type WorkflowInstanceProposal = Omit<WorkflowInstance, 'status'>;

export interface WorkflowInstanceRuleServiceApproval extends WorkflowInstanceContext {
  id: string;
  workflowId: string;
  proposal: WorkflowInstanceProposal;
}

export interface WorkflowInstanceRuleServiceDenial extends WorkflowInstanceContext {
  id: string;
  proposal: WorkflowInstanceProposal;
  validationErrors: RuleServiceResponse[];
}

export interface WorkflowInstanceParticipantApproval extends WorkflowInstanceContext {
  id: string;
  commitment?: Commitment;
  proposal: WorkflowInstanceProposal;
}

export interface WorkflowInstanceParticipantDenial extends WorkflowInstanceContext {
  id: string;
  commitment?: Commitment;
  proposal: WorkflowInstanceProposal;
  reasons?: string[];
}
