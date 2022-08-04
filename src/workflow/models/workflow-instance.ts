import { State, StateValue } from 'xstate';
import { ConsistencyEntity } from '../../consistency';

export class WorkflowInstance implements ConsistencyEntity {
  workflowId: string;
  consistencyId: string;
  currentState?: StateValue | State<any, any>;
}
