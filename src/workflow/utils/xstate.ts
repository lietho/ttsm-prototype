import { EventObject, StateObject } from "src/workflow/dto/workflow-definition-dto";
import { SupportedWorkflowModels } from "src/workflow/models";
import { createMachine, EventData, interpret, MachineConfig, State, StateValue } from "xstate";

export const performStateTransition = (config: MachineConfig<any, any, any>, from: StateValue | State<any>, event: string, payload?: EventData) => {
  const service = interpret(createMachine(config));
  service.start(from);
  const result = service.send(event, payload);
  service.stop();
  return result;
};

export function getCurrentStateDefinition(currentState: State<any,  any>, workflowModel: SupportedWorkflowModels): StateObject {
  const currentStateName = typeof(currentState.value) === "string" ? currentState.value : Object.keys(currentState.value)[0];
  return workflowModel.states[currentStateName];
}

export function getCurrentTransitionDefinition(currentState: State<any,  any>, eventName: string, workflowModel: SupportedWorkflowModels): EventObject | string {
  const stateDefinition = getCurrentStateDefinition(currentState, workflowModel);
  return stateDefinition.on[eventName];
}