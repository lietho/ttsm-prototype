import { SupportedWorkflowConfig, SupportedWorkflowModels } from '../models';
import { MachineConfig } from 'xstate';

/**
 * Maps a specific workflow model (for example state charts, BPMN or choreographies) to a state chart state machine.
 */
export interface WorkflowConfigConverter<T extends SupportedWorkflowModels> {
  (workflow: T, config?: SupportedWorkflowConfig): MachineConfig<any, any, any>;
}
