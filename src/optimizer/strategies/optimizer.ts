import { MachineConfig } from 'xstate';

export interface Optimizer {
  (workflowModel: MachineConfig<any, any, any>): MachineConfig<any, any, any>;
}
