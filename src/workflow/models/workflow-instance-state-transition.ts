import { EventData, State, StateValue } from 'xstate';

export interface WorkflowInstanceStateTransition {
  id: string;
  from: StateValue | State<any, any>;
  to: StateValue | State<any, any>;
  event: string;
  payload?: EventData;
}

export type WorkflowInstanceStateTransitionAcceptance = WorkflowInstanceStateTransition & { commitmentReference: string };

export interface WorkflowInstanceStateTransitionRejection extends WorkflowInstanceStateTransition {
  commitmentReference: string;
  reason?: string;
}
