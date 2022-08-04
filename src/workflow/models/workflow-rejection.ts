import { WorkflowProposal } from './workflow';

export interface WorkflowRejection {
  id: string;
  commitmentReference: string;
  proposal: WorkflowProposal;
  reason?: string;
}
