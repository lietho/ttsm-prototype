import { EventData } from 'xstate';

export class WorkflowInstanceTransitionDto {
  event: string;
  payload: EventData;
}
