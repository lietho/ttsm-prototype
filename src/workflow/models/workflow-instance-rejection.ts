import { WorkflowInstanceProposal } from './workflow-instance';

export interface WorkflowInstanceRejection {
  id: string;
  commitmentReference: string;
  proposal: WorkflowInstanceProposal;
  reason?: string;
}
