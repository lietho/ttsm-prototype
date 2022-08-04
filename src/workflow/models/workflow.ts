import { MachineConfig } from 'xstate';
import { WorkflowConfig } from './workflow-config';
import { ConsistencyEntity } from '../../consistency';

/**
 * The derived status of a workflow.
 */
export type WorkflowStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

export interface Workflow extends ConsistencyEntity {
  config?: Partial<WorkflowConfig>;
  workflowModel: MachineConfig<any, any, any>;
}

/**
 * Contains all information that is required for a workflow proposal.
 */
export type WorkflowProposal = Omit<Workflow, 'status'>;
