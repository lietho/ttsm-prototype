import { State, StateValue } from 'xstate';
import { ConsistencyEntity } from '../../consistency';
import { RuleServiceValidationError } from '../../rules';
import { WorkflowInstanceTransitionParticipantApproval, WorkflowInstanceTransitionParticipantDenial } from './workflow-instance-transition';

/**
 * The derived status of a workflow instance.
 */
export type WorkflowInstanceStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

export interface WorkflowInstance extends ConsistencyEntity {
  workflowId: string;
  currentState?: StateValue | State<any, any>;
  acceptedByRuleServices?: boolean;
  acceptedByParticipants?: boolean;
  participantsAccepted?: WorkflowInstanceTransitionParticipantApproval[] | WorkflowInstanceParticipantApproval[];
  participantsRejected?: WorkflowInstanceTransitionParticipantDenial[] | WorkflowInstanceParticipantDenial[];
}

/**
 * Contains all information that is required to launch a new workflow instance.
 */
export type WorkflowInstanceProposal = Omit<WorkflowInstance, 'status'>;

export interface WorkflowInstanceRuleServiceApproval {
  id: string;
  proposal: WorkflowInstanceProposal;
}

export interface WorkflowInstanceRuleServiceDenial {
  id: string;
  proposal: WorkflowInstanceProposal;
  validationErrors: RuleServiceValidationError[];
}

export interface WorkflowInstanceParticipantApproval {
  id: string;
  commitmentReference?: string;
  proposal: WorkflowInstanceProposal;
}

export interface WorkflowInstanceParticipantDenial {
  id: string;
  commitmentReference?: string;
  proposal: WorkflowInstanceProposal;
  reasons?: string[];
}
