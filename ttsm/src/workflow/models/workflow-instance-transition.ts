import { State } from "xstate";
import { RuleServiceResponse } from "../../rules";

export interface WorkflowInstanceTransitionContext {
  workflowId: string;
  id: string;
  organizationId: string;
}

export interface WorkflowInstanceTransition extends WorkflowInstanceTransitionContext {
  id: string;
  from: State<any, any>;
  to: State<any, any>;
  event: string;
  payload?: object;
  commitment: Commitment;
  originatingExternalTransition?: ExternalWorkflowInstanceTransition;
  originatingExternalTransitionApproval?: WorkflowInstanceTransitionParticipantApproval;
}

export interface ExternalWorkflowInstanceTransition {
  organizationId: string;
  workflowId: string;
  instanceId?: string;
  externalIdentifier: string;
  event: string;
  payload?: object;
  originatingParticipant?: OriginatingParticipant;
}

export interface OriginatingParticipant {
  organizationId: string;
  workflowId: string;
  workflowInstanceId: string;
  externalIdentifier: string;
}

export interface WorkflowInstanceTransitionRuleServiceApproval extends WorkflowInstanceTransitionContext {
  id: string;
  transition: WorkflowInstanceTransition;
}

export interface WorkflowInstanceTransitionRuleServiceDenial extends WorkflowInstanceTransitionContext {
  id: string;
  transition: WorkflowInstanceTransition;
  validationErrors: RuleServiceResponse[];
}

export interface WorkflowInstanceTransitionParticipantApproval extends WorkflowInstanceTransitionContext {
  id: string;
  transition: ExternalWorkflowInstanceTransition;
  originatingParticipant: OriginatingParticipant;
  commitment?: Commitment;
}

export interface WorkflowInstanceTransitionParticipantDenial extends WorkflowInstanceTransitionContext {
  id: string;
  transition: ExternalWorkflowInstanceTransition;
  commitment?: Commitment;
  reasons?: string[];
}

export interface Commitment {
  reference: string;
  timestamp: Date;
}
