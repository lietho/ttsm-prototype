import {
  ExternalWorkflowInstanceTransition,
  WorkflowInstanceParticipantApproval,
  WorkflowInstanceParticipantDenial,
  WorkflowInstanceProposal,
  WorkflowInstanceTransitionParticipantApproval,
  WorkflowInstanceTransitionParticipantDenial,
  WorkflowProposal,
  WorkflowProposalParticipantApproval,
  WorkflowProposalParticipantDenial
} from "../workflow";
import { createConsistencyMessage } from "./utils";

export const proposeWorkflow = createConsistencyMessage<WorkflowProposal>('[Workflow] Create new workflow');
export const acceptWorkflow = createConsistencyMessage<WorkflowProposalParticipantApproval>('[Workflow] Accept workflow');
export const rejectWorkflow = createConsistencyMessage<WorkflowProposalParticipantDenial>('[Workflow] Reject workflow');

export const launchWorkflowInstance = createConsistencyMessage<WorkflowInstanceProposal>('[Workflow] Launch new workflow instance');
export const acceptWorkflowInstance = createConsistencyMessage<WorkflowInstanceParticipantApproval>('[Workflow] Accept workflow instance');
export const rejectWorkflowInstance = createConsistencyMessage<WorkflowInstanceParticipantDenial>('[Workflow] Reject workflow instance');

export const advanceWorkflowInstance = createConsistencyMessage<ExternalWorkflowInstanceTransition>('[Workflow] Advance workflow instance');
export const acceptTransition = createConsistencyMessage<WorkflowInstanceTransitionParticipantApproval>('[Workflow] Accept workflow instance transition');
export const rejectTransition = createConsistencyMessage<WorkflowInstanceTransitionParticipantDenial>('[Workflow] Reject workflow instance transition');
