import { State, StateValue } from 'xstate';

export interface WorkflowInstanceStateAdvancement {
  id: string;
  from: StateValue | State<any, any>;
  to: StateValue | State<any, any>;
  event: string;
}

export type WorkflowInstanceStateAdvancementAcceptance = WorkflowInstanceStateAdvancement & { commitmentReference: string };

export interface WorkflowInstanceStateAdvancementRejection extends WorkflowInstanceStateAdvancement {
  commitmentReference: string;
  reason?: string;
}
