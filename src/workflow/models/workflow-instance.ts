import { State, StateValue } from 'xstate';
import { ConsistencyEntity } from '../../consistency';

/**
 * The derived status of a workflow instance.
 */
export type WorkflowInstanceStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

export interface WorkflowInstance extends ConsistencyEntity {
  workflowId: string;
  currentState?: StateValue | State<any, any>;
}

/**
 * Contains all information that is required to launch a new workflow instance.
 */
export type WorkflowInstanceProposal = Omit<WorkflowInstance, 'status'>;
