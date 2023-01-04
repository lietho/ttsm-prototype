import { EventData, State, StateValue } from 'xstate';
import { RuleServiceValidationError } from '../../rules';

export interface WorkflowInstanceTransitionContext {
  workflowId: string;
  id: string;
}

export interface WorkflowInstanceTransition extends WorkflowInstanceTransitionContext {
  id: string;
  from: StateValue | State<any, any>;
  to: StateValue | State<any, any>;
  event: string;
  payload?: EventData;
  commitmentReference?: string;
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
  transition: WorkflowInstanceTransition;
  commitmentReference?: string;
}

export interface WorkflowInstanceTransitionParticipantDenial extends WorkflowInstanceTransitionContext {
  id: string;
  transition: WorkflowInstanceTransition;
  commitmentReference?: string;
  reasons?: string[];
}
