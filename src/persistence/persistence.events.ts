import { createPersistenceEvent } from './utils';
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
} from '../workflow/models';

export const proposeWorkflow = createPersistenceEvent<WorkflowProposal>('ProposeWorkflow');
export const receiveWorkflow = createPersistenceEvent<WorkflowProposal>('ReceiveWorkflowProposal');
export const acceptWorkflow = createPersistenceEvent<WorkflowAcceptance>('AcceptWorkflow');
export const rejectWorkflow = createPersistenceEvent<WorkflowRejection>('RejectWorkflow');

export const launchWorkflowInstance = createPersistenceEvent<WorkflowInstanceProposal>('ProposeWorkflowInstance');
export const receiveWorkflowInstance = createPersistenceEvent<WorkflowInstanceProposal>('ReceiveWorkflowProposal');
export const acceptWorkflowInstance = createPersistenceEvent<WorkflowInstanceAcceptance>('AcceptWorkflowInstance');
export const rejectWorkflowInstance = createPersistenceEvent<WorkflowInstanceRejection>('RejectWorkflowInstance');

export const advanceWorkflowInstanceState = createPersistenceEvent<WorkflowInstanceStateAdvancement>('AdvanceWorkflowInstanceState');
export const acceptAdvanceWorkflowInstanceState = createPersistenceEvent<WorkflowInstanceStateAdvancementAcceptance>('AcceptAdvanceWorkflowInstanceState');
export const rejectAdvanceWorkflowInstanceState = createPersistenceEvent<WorkflowInstanceStateAdvancementRejection>('RejectAdvanceWorkflowInstanceState');
