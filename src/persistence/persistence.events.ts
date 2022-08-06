import { createPersistenceEvent } from './utils';
import {
  WorkflowInstanceParticipantApproval,
  WorkflowInstanceParticipantDenial,
  WorkflowInstanceProposal,
  WorkflowInstanceRuleServiceApproval,
  WorkflowInstanceRuleServiceDenial,
  WorkflowInstanceTransitionParticipantDenial,
  WorkflowInstanceTransition,
  WorkflowInstanceTransitionParticipantApproval,
  WorkflowInstanceTransitionRuleServiceApproval,
  WorkflowInstanceTransitionRuleServiceDenial,
  WorkflowProposal,
  WorkflowProposalParticipantApproval,
  WorkflowProposalParticipantDenial,
  WorkflowProposalRuleServiceApproval,
  WorkflowProposalRuleServiceDenial
} from '../workflow';
import { RuleService } from '../rules';

// Workflow events
export const proposeWorkflow = createPersistenceEvent<WorkflowProposal>('ProposeWorkflow');
export const proposeWorkflowReceived = createPersistenceEvent<WorkflowProposal>('WorkflowProposalReceived');
export const proposeWorkflowAcceptedByRuleService = createPersistenceEvent<WorkflowProposalRuleServiceApproval>('WorkflowProposalAcceptedByRuleService');
export const proposeWorkflowRejectedByRuleService = createPersistenceEvent<WorkflowProposalRuleServiceDenial>('WorkflowProposalRejectedByRuleService');
export const proposeWorkflowAcceptedByParticipant = createPersistenceEvent<WorkflowProposalParticipantApproval>('WorkflowProposalAcceptedByParticipant');
export const proposeWorkflowRejectedByParticipant = createPersistenceEvent<WorkflowProposalParticipantDenial>('WorkflowProposalRejectedByParticipant');

export const launchWorkflowInstance = createPersistenceEvent<WorkflowInstanceProposal>('LaunchWorkflowInstance');
export const launchWorkflowInstanceReceived = createPersistenceEvent<WorkflowInstanceProposal>('WorkflowInstanceReceived');
export const launchWorkflowInstanceAcceptedByRuleService = createPersistenceEvent<WorkflowInstanceRuleServiceApproval>('WorkflowInstanceAcceptedByRuleService');
export const launchWorkflowInstanceRejectedByRuleService = createPersistenceEvent<WorkflowInstanceRuleServiceDenial>('WorkflowInstanceRejectedByRuleService');
export const launchWorkflowInstanceAcceptedByParticipant = createPersistenceEvent<WorkflowInstanceParticipantApproval>('WorkflowInstanceAcceptedByParticipant');
export const launchWorkflowInstanceRejectedByParticipant = createPersistenceEvent<WorkflowInstanceParticipantDenial>('WorkflowInstanceRejectedByParticipant');

export const advanceWorkflowInstance = createPersistenceEvent<WorkflowInstanceTransition>('AdvanceWorkflowInstance');
export const advanceWorkflowInstanceReceived = createPersistenceEvent<WorkflowInstanceTransition>('AdvanceWorkflowInstanceReceived');
export const advanceWorkflowInstanceAcceptedByRuleService = createPersistenceEvent<WorkflowInstanceTransitionRuleServiceApproval>('AdvanceWorkflowInstanceAcceptedByRuleService');
export const advanceWorkflowInstanceRejectedByRuleService = createPersistenceEvent<WorkflowInstanceTransitionRuleServiceDenial>('AdvanceWorkflowInstanceRejectedByRuleService');
export const advanceWorkflowInstanceAcceptedByParticipant = createPersistenceEvent<WorkflowInstanceTransitionParticipantApproval>('AdvanceWorkflowInstanceAcceptedByParticipant');
export const advanceWorkflowInstanceRejectedByParticipant = createPersistenceEvent<WorkflowInstanceTransitionParticipantDenial>('AdvanceWorkflowInstanceRejectedByParticipant');

// Rule engine events
export const registerRuleService = createPersistenceEvent<RuleService>('RegisterRuleService');
export const unregisterRuleService = createPersistenceEvent<{ id: string }>('UnregisterRuleService');
