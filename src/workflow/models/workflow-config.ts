import { SupportedOptimizer } from '../../optimizer';

export class WorkflowConfig {
  name: string;
  type: SupportedWorkflowTypes = 'STATE_CHARTS';
  optimizer: SupportedOptimizer[] | boolean = false;
  initial: string;
}

export type SupportedWorkflowTypes = 'STATE_CHARTS';
