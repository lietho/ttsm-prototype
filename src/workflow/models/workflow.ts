import { MachineConfig } from 'xstate';
import { WorkflowConfig } from './workflow-config';
import { ConsistencyEntity } from '../../consistency';

export class Workflow implements ConsistencyEntity {
  config?: Partial<WorkflowConfig>;
  workflowModel: MachineConfig<any, any, any>;
  consistencyId: string;
}
