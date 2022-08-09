import { EventData, State, StateValue } from 'xstate';
import { RuleServiceValidationError } from '../../rules';

export interface WorkflowInstanceTransition {
  id: string;
  from: StateValue | State<any, any>;
  to: StateValue | State<any, any>;
  event: string;
  payload?: EventData;
  commitmentReference?: string;
}

export interface WorkflowInstanceTransitionRuleServiceApproval {
  id: string;
  transition: WorkflowInstanceTransition;
}

export interface WorkflowInstanceTransitionRuleServiceDenial {
  id: string;
  transition: WorkflowInstanceTransition;
  validationErrors: RuleServiceValidationError[];
}

export interface WorkflowInstanceTransitionParticipantApproval {
  id: string;
  transition: WorkflowInstanceTransition;
  commitmentReference?: string;
}

export interface WorkflowInstanceTransitionParticipantDenial {
  id: string;
  transition: WorkflowInstanceTransition;
  commitmentReference?: string;
  reasons?: string[];
}
