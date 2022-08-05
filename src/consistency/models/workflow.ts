import {
  WorkflowAcceptance,
  WorkflowInstanceAcceptance,
  WorkflowInstanceProposal,
  WorkflowInstanceRejection,
  WorkflowInstanceStateTransition,
  WorkflowInstanceStateTransitionAcceptance,
  WorkflowInstanceStateTransitionRejection,
  WorkflowProposal,
  WorkflowRejection
} from '../../workflow/models';

export type WorkflowProposalConsistencyMessage = WorkflowProposal;
export type WorkflowAcceptanceConsistencyMessage = WorkflowAcceptance;
export type WorkflowRejectionConsistencyMessage = WorkflowRejection;
export type WorkflowInstanceProposalConsistencyMessage = WorkflowInstanceProposal;
export type WorkflowInstanceAcceptanceConsistencyMessage = WorkflowInstanceAcceptance;
export type WorkflowInstanceRejectionConsistencyMessage = WorkflowInstanceRejection;
export type WorkflowInstanceStateAdvancementConsistencyMessage = WorkflowInstanceStateTransition;
export type WorkflowInstanceStateAdvancementAcceptanceConsistencyMessage = WorkflowInstanceStateTransitionAcceptance;
export type WorkflowInstanceStateAdvancementRejectionConsistencyMessage = WorkflowInstanceStateTransitionRejection;
