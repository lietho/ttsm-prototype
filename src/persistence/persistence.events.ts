import { createPersistenceEvent } from './utils';
import {
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
  WorkflowProposalApproval,
  WorkflowProposalDenial,
  WorkflowProposalParticipantApproval,
  WorkflowProposalParticipantDenial,
  WorkflowProposalRuleServiceApproval,
  WorkflowProposalRuleServiceDenial
} from '../workflow';

// Workflow commands and events
export const proposeWorkflow = createPersistenceEvent<WorkflowProposal>('Client.Workflow.Propose');
export const receivedWorkflow = createPersistenceEvent<WorkflowProposal>('Consistency.Workflow.Received');
export const localWorkflowAcceptedByRuleService = createPersistenceEvent<WorkflowProposalRuleServiceApproval>('Rules.Workflow.ClientProposalAccepted');
export const localWorkflowRejectedByRuleService = createPersistenceEvent<WorkflowProposalRuleServiceDenial>('Rules.Workflow.ClientProposalRejected');
export const receivedWorkflowAcceptedByRuleService = createPersistenceEvent<WorkflowProposalRuleServiceApproval>('Rules.Workflow.ReceivedProposalAccepted');
export const receivedWorkflowRejectedByRuleService = createPersistenceEvent<WorkflowProposalRuleServiceDenial>('Rules.Workflow.ReceivedProposalRejected');
export const workflowAcceptedByParticipant = createPersistenceEvent<WorkflowProposalParticipantApproval>('Consistency.Workflow.AcceptedByParticipant');
export const workflowRejectedByParticipant = createPersistenceEvent<WorkflowProposalParticipantDenial>('Consistency.Workflow.RejectedByParticipant');
export const workflowAccepted = createPersistenceEvent<WorkflowProposalApproval>('Consistency.Workflow.Accepted');
export const workflowRejected = createPersistenceEvent<WorkflowProposalDenial>('Consistency.Workflow.Rejected');

export const launchWorkflowInstance = createPersistenceEvent<WorkflowInstanceProposal>('Client.Instance.Launch');
export const receivedWorkflowInstance = createPersistenceEvent<WorkflowInstanceProposal>('Consistency.Instance.Received');
export const localWorkflowInstanceAcceptedByRuleService = createPersistenceEvent<WorkflowInstanceRuleServiceApproval>('Rules.Instance.ClientProposalAccepted');
export const localWorkflowInstanceRejectedByRuleService = createPersistenceEvent<WorkflowInstanceRuleServiceDenial>('Rules.Instance.ClientProposalRejected');
export const receivedWorkflowInstanceAcceptedByRuleService = createPersistenceEvent<WorkflowInstanceRuleServiceApproval>('Rules.Instance.ReceivedProposalAccepted');
export const receivedWorkflowInstanceRejectedByRuleService = createPersistenceEvent<WorkflowInstanceRuleServiceDenial>('Rules.Instance.ReceivedProposalRejected');
export const workflowInstanceAcceptedByParticipant = createPersistenceEvent<WorkflowInstanceParticipantApproval>('Consistency.Instance.AcceptedByParticipant');
export const workflowInstanceRejectedByParticipant = createPersistenceEvent<WorkflowInstanceParticipantDenial>('Consistency.Instance.RejectedByParticipant');
export const workflowInstanceAccepted = createPersistenceEvent<WorkflowInstanceParticipantApproval>('Consistency.Instance.Accepted');
export const workflowInstanceRejected = createPersistenceEvent<WorkflowInstanceParticipantDenial>('Consistency.Instance.Rejected');

export const advanceWorkflowInstance = createPersistenceEvent<WorkflowInstanceTransition>('Client.Instance.Advance');
export const receivedTransition = createPersistenceEvent<WorkflowInstanceTransition>('Consistency.Instance.TransitionReceived');
export const localTransitionAcceptedByRuleService = createPersistenceEvent<WorkflowInstanceTransitionRuleServiceApproval>('Rules.Instance.ClientTransitionAccepted');
export const localTransitionRejectedByRuleService = createPersistenceEvent<WorkflowInstanceTransitionRuleServiceDenial>('Rules.Instance.ClientTransitionRejected');
export const receivedTransitionAcceptedByRuleService = createPersistenceEvent<WorkflowInstanceTransitionRuleServiceApproval>('Rules.Instance.ReceivedTransitionAccepted');
export const receivedTransitionRejectedByRuleService = createPersistenceEvent<WorkflowInstanceTransitionRuleServiceDenial>('Rules.Instance.ReceivedTransitionRejected');
export const transitionAcceptedByParticipant = createPersistenceEvent<WorkflowInstanceTransitionParticipantApproval>('Consistency.Instance.TransitionAcceptedByParticipant');
export const transitionRejectedByParticipant = createPersistenceEvent<WorkflowInstanceTransitionParticipantDenial>('Consistency.Instance.TransitionRejectedByParticipant');
export const transitionAccepted = createPersistenceEvent<WorkflowInstanceTransitionParticipantApproval>('Consistency.Instance.TransitionAccepted');
export const transitionRejected = createPersistenceEvent<WorkflowInstanceTransitionParticipantDenial>('Consistency.Instance.TransitionRejected');
