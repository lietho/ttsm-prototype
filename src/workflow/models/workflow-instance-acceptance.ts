import { WorkflowInstanceProposal } from './workflow-instance';

export interface WorkflowInstanceAcceptance {
  id: string;
  commitmentReference: string;
  proposal: WorkflowInstanceProposal;
}
