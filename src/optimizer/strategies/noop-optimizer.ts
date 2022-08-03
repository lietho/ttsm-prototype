import { Optimizer } from './optimizer';

/**
 * Just passes the workflow model through.
 * @param workflowModel Workflow model to be optimized.
 */
export const noopOptimizer: Optimizer = (workflowModel) => ({ ...workflowModel });
