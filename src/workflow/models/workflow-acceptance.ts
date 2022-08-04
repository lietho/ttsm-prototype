import { WorkflowProposal } from './workflow';

export interface WorkflowAcceptance {
  id: string;
  commitmentReference: string;
  proposal: WorkflowProposal;
}
