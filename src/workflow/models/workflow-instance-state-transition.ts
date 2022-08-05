import { EventData, State, StateValue } from 'xstate';

export interface WorkflowInstanceStateTransition {
  id: string;
  from: StateValue | State<any, any>;
  to: StateValue | State<any, any>;
  event: string;
  payload?: EventData;
  commitmentReference?: string;
}

export type WorkflowInstanceStateTransitionAcceptance = WorkflowInstanceStateTransition;

export interface WorkflowInstanceStateTransitionRejection extends WorkflowInstanceStateTransition {
  reason?: string;
}
