import { createPersistenceEvent } from './utils';
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
} from '../workflow';
import { RuleService } from '../rules';

// Workflow events
export const proposeWorkflow = createPersistenceEvent<WorkflowProposal>('ProposeWorkflow');
export const receiveWorkflow = createPersistenceEvent<WorkflowProposal>('ReceiveWorkflowProposal');
export const acceptWorkflow = createPersistenceEvent<WorkflowAcceptance>('AcceptWorkflow');
export const rejectWorkflow = createPersistenceEvent<WorkflowRejection>('RejectWorkflow');

export const launchWorkflowInstance = createPersistenceEvent<WorkflowInstanceProposal>('ProposeWorkflowInstance');
export const receiveWorkflowInstance = createPersistenceEvent<WorkflowInstanceProposal>('ReceiveWorkflowProposal');
export const acceptWorkflowInstance = createPersistenceEvent<WorkflowInstanceAcceptance>('AcceptWorkflowInstance');
export const rejectWorkflowInstance = createPersistenceEvent<WorkflowInstanceRejection>('RejectWorkflowInstance');

export const advanceWorkflowInstanceState = createPersistenceEvent<WorkflowInstanceStateTransition>('AdvanceWorkflowInstanceState');
export const receiveAdvanceWorkflowInstanceState = createPersistenceEvent<WorkflowInstanceStateTransition>('ReceiveAdvanceWorkflowInstanceState');
export const acceptAdvanceWorkflowInstanceState = createPersistenceEvent<WorkflowInstanceStateTransitionAcceptance>('AcceptAdvanceWorkflowInstanceState');
export const rejectAdvanceWorkflowInstanceState = createPersistenceEvent<WorkflowInstanceStateTransitionRejection>('RejectAdvanceWorkflowInstanceState');

// Rule engine events
export const registerRuleService = createPersistenceEvent<RuleService>('RegisterRuleService');
export const unregisterRuleService = createPersistenceEvent<{ id: string }>('UnregisterRuleService');
