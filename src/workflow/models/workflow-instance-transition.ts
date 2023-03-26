import { State } from "xstate";
import { RuleServiceValidationError } from "../../rules";

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
  commitmentReference?: string;
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
  validationErrors: RuleServiceValidationError[];
}

export interface WorkflowInstanceTransitionParticipantApproval extends WorkflowInstanceTransitionContext {
  id: string;
  transition: ExternalWorkflowInstanceTransition;
  originatingParticipant: OriginatingParticipant;
  commitmentReference?: string;
}

export interface WorkflowInstanceTransitionParticipantDenial extends WorkflowInstanceTransitionContext {
  id: string;
  transition: ExternalWorkflowInstanceTransition;
  commitmentReference?: string;
  reasons?: string[];
}
