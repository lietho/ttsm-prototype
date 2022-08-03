import { WorkflowConfigConverter } from '../workflow-config.converter';
import { StateChartWorkflow } from './state-chart-workflow';

export const convertStateChartWorkflowConfig: WorkflowConfigConverter<StateChartWorkflow> = (workflow, config) => ({
  ...workflow,
  id: config?.name,
  initial: config.initial ?? workflow.initial
});
