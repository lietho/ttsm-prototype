import { StateChartWorkflow } from "src/workflow/converter";

export interface Optimizer {
  (workflowModel: StateChartWorkflow): StateChartWorkflow;
}
