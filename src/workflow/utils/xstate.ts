import { createMachine, MachineConfig, State, StateValue } from 'xstate';

export const performStateTransition = (config: MachineConfig<any, any, any>, from: StateValue | State<any>, event: string): State<any> => {
  const machine = createMachine(config);
  const result = machine.transition(from as any, event);
  return result as unknown as State<any>;
};
