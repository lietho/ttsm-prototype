import { SupportedOptimizer } from '../../optimizer';

export class WorkflowConfig {
  type: SupportedWorkflowTypes = 'STATE_CHARTS';
  optimizer: SupportedOptimizer[] | boolean = false;
}

export type SupportedWorkflowTypes = 'STATE_CHARTS';
