import { createMachine, EventData, interpret, MachineConfig, State, StateValue } from 'xstate';

export const performStateTransition = (config: MachineConfig<any, any, any>, from: StateValue | State<any>, event: string, payload?: EventData) => {
  const service = interpret(createMachine(config));
  service.start(from);
  const result = service.send(event, payload);
  service.stop();
  return result;
};
