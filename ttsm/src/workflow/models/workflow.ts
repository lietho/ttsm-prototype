import { SupportedWorkflowModels } from "src/workflow/models/workflow.dto";
import { ConsistencyEntity } from "../../consistency";
import { RuleServiceResponse } from "../../rules";
import { WorkflowConfig } from "./workflow-config";
import { Commitment } from "./workflow-instance-transition";

/**
 * The derived status of a workflow.
 */
export type WorkflowStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

export interface WorkflowContext {
  id: string;
  organizationId: string;
}

export interface Workflow extends ConsistencyEntity, WorkflowContext {
  config?: Partial<WorkflowConfig>;
  workflowModel: SupportedWorkflowModels;
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
  validationErrors: RuleServiceResponse[];
}

export interface WorkflowProposalParticipantApproval {
  id: string;
  proposal: WorkflowProposal;
  commitment?: Commitment;
}

export interface WorkflowProposalParticipantDenial {
  id: string;
  proposal: WorkflowProposal;
  reasons?: string[];
  commitment?: Commitment;
}

export type WorkflowProposalApproval = WorkflowProposalParticipantApproval;
export type WorkflowProposalDenial = WorkflowProposalParticipantDenial;
