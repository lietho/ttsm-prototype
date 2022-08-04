import {
  WorkflowAcceptance,
  WorkflowInstanceAcceptance,
  WorkflowInstanceProposal,
  WorkflowInstanceRejection,
  WorkflowInstanceStateAdvancement,
  WorkflowInstanceStateAdvancementAcceptance,
  WorkflowInstanceStateAdvancementRejection,
  WorkflowProposal,
  WorkflowRejection
} from '../../workflow/models';

export type WorkflowProposalConsistencyMessage = WorkflowProposal;
export type WorkflowAcceptanceConsistencyMessage = WorkflowAcceptance;
export type WorkflowRejectionConsistencyMessage = WorkflowRejection;
export type WorkflowInstanceProposalConsistencyMessage = WorkflowInstanceProposal;
export type WorkflowInstanceAcceptanceConsistencyMessage = WorkflowInstanceAcceptance;
export type WorkflowInstanceRejectionConsistencyMessage = WorkflowInstanceRejection;
export type WorkflowInstanceStateAdvancementConsistencyMessage = WorkflowInstanceStateAdvancement;
export type WorkflowInstanceStateAdvancementAcceptanceConsistencyMessage = WorkflowInstanceStateAdvancementAcceptance;
export type WorkflowInstanceStateAdvancementRejectionConsistencyMessage = WorkflowInstanceStateAdvancementRejection;
