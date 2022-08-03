import { State, StateValue } from 'xstate';

export class WorkflowInstance {
  workflowId: string;
  consistencyId: string;
  currentState?: StateValue | State<any, any>;
}
