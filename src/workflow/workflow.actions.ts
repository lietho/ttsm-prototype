import { StateValue } from 'xstate';
import { createConsistencyMessage } from '../consistency';
import { SupportedWorkflowConfig, SupportedWorkflowModels } from './models';

export const createWorkflow = createConsistencyMessage<{ consistencyId: string, workflow: SupportedWorkflowModels, config?: SupportedWorkflowConfig }>('[Workflow] Create new workflow');
export const acceptWorkflow = createConsistencyMessage<{ consistencyId: string }>('[Workflow] Accept workflow');
export const rejectWorkflow = createConsistencyMessage<{ consistencyId: string }>('[Workflow] Reject workflow');

export const launchWorkflowInstance = createConsistencyMessage<{ workflowConsistencyId: string, workflowInstanceConsistencyId: string }>('[Workflow] Launch new workflow instance');
export const acceptWorkflowInstance = createConsistencyMessage<{ consistencyId: string }>('[Workflow] Accept workflow instance');
export const rejectWorkflowInstance = createConsistencyMessage<{ consistencyId: string }>('[Workflow] Reject workflow instance');

export const advanceWorkflowInstance = createConsistencyMessage<{ workflowInstanceConsistencyId: string, fromState: StateValue, transitionEvent: string }>('[Workflow] Advance workflow instance');
export const acceptAdvanceWorkflowInstance = createConsistencyMessage<{ workflowInstanceConsistencyId: string, fromState: StateValue, transitionEvent: string }>('[Workflow] Accept advance workflow instance');
export const rejectAdvanceWorkflowInstance = createConsistencyMessage<{ workflowInstanceConsistencyId: string, fromState: StateValue, transitionEvent: string, err: string }>('[Workflow] Reject advance workflow instance');
