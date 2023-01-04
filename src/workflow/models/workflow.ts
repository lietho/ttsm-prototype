import { MachineConfig } from 'xstate';
import { WorkflowConfig } from './workflow-config';
import { ConsistencyEntity } from '../../consistency';
import { RuleServiceValidationError } from '../../rules';

/**
 * The derived status of a workflow.
 */
export type WorkflowStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

export interface WorkflowContext {
  id: string;
}

export interface Workflow extends ConsistencyEntity, WorkflowContext {
  config?: Partial<WorkflowConfig>;
  workflowModel: MachineConfig<any, any, any>;
  acceptedByRuleServices?: boolean;
  acceptedByParticipants?: boolean;
  participantsAccepted?: WorkflowProposalParticipantApproval[];
  participantsRejected?: WorkflowProposalParticipantDenial[];
}

/**
 * Contains all information that is required for a workflow proposal.
 */
export type WorkflowProposal = Omit<Workflow, 'status'>;

export interface WorkflowProposalRuleServiceApproval {
  id: string;
  proposal: WorkflowProposal;
}

export interface WorkflowProposalRuleServiceDenial {
  id: string;
  proposal: WorkflowProposal;
  validationErrors: RuleServiceValidationError[];
}

export interface WorkflowProposalParticipantApproval {
  id: string;
  proposal: WorkflowProposal;
  commitmentReference?: string;
}

export interface WorkflowProposalParticipantDenial {
  id: string;
  proposal: WorkflowProposal;
  reasons?: string[];
  commitmentReference?: string;
}

export type WorkflowProposalApproval = WorkflowProposalParticipantApproval;
export type WorkflowProposalDenial = WorkflowProposalParticipantDenial;
