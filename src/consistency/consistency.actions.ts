import { createConsistencyMessage } from './utils';
import {
  WorkflowInstanceParticipantApproval,
  WorkflowInstanceParticipantDenial,
  WorkflowInstanceProposal,
  WorkflowInstanceTransition,
  WorkflowInstanceTransitionParticipantApproval,
  WorkflowInstanceTransitionParticipantDenial,
  WorkflowProposal,
  WorkflowProposalParticipantApproval,
  WorkflowProposalParticipantDenial
} from '../workflow';

export const proposeWorkflow = createConsistencyMessage<WorkflowProposal>('[Workflow] Create new workflow');
export const acceptWorkflow = createConsistencyMessage<WorkflowProposalParticipantApproval>('[Workflow] Accept workflow');
export const rejectWorkflow = createConsistencyMessage<WorkflowProposalParticipantDenial>('[Workflow] Reject workflow');

export const launchWorkflowInstance = createConsistencyMessage<WorkflowInstanceProposal>('[Workflow] Launch new workflow instance');
export const acceptWorkflowInstance = createConsistencyMessage<WorkflowInstanceParticipantApproval>('[Workflow] Accept workflow instance');
export const rejectWorkflowInstance = createConsistencyMessage<WorkflowInstanceParticipantDenial>('[Workflow] Reject workflow instance');

export const advanceWorkflowInstance = createConsistencyMessage<WorkflowInstanceTransition>('[Workflow] Advance workflow instance');
export const acceptAdvanceWorkflowInstance = createConsistencyMessage<WorkflowInstanceTransitionParticipantApproval>('[Workflow] Accept advance workflow instance');
export const rejectAdvanceWorkflowInstance = createConsistencyMessage<WorkflowInstanceTransitionParticipantDenial>('[Workflow] Reject advance workflow instance');
