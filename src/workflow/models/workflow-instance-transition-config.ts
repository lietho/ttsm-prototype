import { EventData } from 'xstate';

export class WorkflowInstanceTransitionConfig {
  event: string;
  payload: EventData;
}
