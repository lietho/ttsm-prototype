import { StateChartWorkflow } from '../converter';
import { WorkflowConfig } from './workflow-config';

export class WorkflowDto {
  config?: SupportedWorkflowConfig;
  workflow: SupportedWorkflowModels;
}

export type SupportedWorkflowConfig = Partial<WorkflowConfig>;
export type SupportedWorkflowModels = StateChartWorkflow;
