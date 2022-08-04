import { createConsistencyMessage } from './utils';
import {
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

export const proposeWorkflow = createConsistencyMessage<WorkflowProposalConsistencyMessage>('[Workflow] Create new workflow');
export const acceptWorkflow = createConsistencyMessage<WorkflowAcceptanceConsistencyMessage>('[Workflow] Accept workflow');
export const rejectWorkflow = createConsistencyMessage<WorkflowRejectionConsistencyMessage>('[Workflow] Reject workflow');

export const launchWorkflowInstance = createConsistencyMessage<WorkflowInstanceProposalConsistencyMessage>('[Workflow] Launch new workflow instance');
export const acceptWorkflowInstance = createConsistencyMessage<WorkflowInstanceAcceptanceConsistencyMessage>('[Workflow] Accept workflow instance');
export const rejectWorkflowInstance = createConsistencyMessage<WorkflowInstanceRejectionConsistencyMessage>('[Workflow] Reject workflow instance');

export const advanceWorkflowInstance = createConsistencyMessage<WorkflowInstanceStateAdvancementConsistencyMessage>('[Workflow] Advance workflow instance');
export const acceptAdvanceWorkflowInstance = createConsistencyMessage<WorkflowInstanceStateAdvancementAcceptanceConsistencyMessage>('[Workflow] Accept advance workflow instance');
export const rejectAdvanceWorkflowInstance = createConsistencyMessage<WorkflowInstanceStateAdvancementRejectionConsistencyMessage>('[Workflow] Reject advance workflow instance');
