import Ajv from "ajv";
import * as deepmerge from "deepmerge";
import { JSONPath } from "jsonpath-plus";
import {
  EventObject,
  ExternalParticipant,
  ListCondition,
  ObjectDefinition
} from "src/workflow/dto/workflow-definition-dto";
import { InvalidStateChartException } from "src/workflow/exception/invalid-state-chart.exception";
import { assign, MachineConfig } from "xstate";
import { WorkflowConfigConverter } from "../workflow-config.converter";
import { StateChartWorkflow } from "./state-chart-workflow";

const STATE_NAME_EXTERNAL_PARTICIPANT_ACK = "$EXTERNAL_RECEIVED_ACK";
export const EVENT_NAME_EXTERNAL_PARTICIPANT_ACK_PREFIX = "$RECEIVE_ACK_";
export const EVENT_NAME_EXTERNAL_PARTICIPANT_NACK_PREFIX = "$RECEIVE_NACK_";

export const convertStateChartWorkflowConfig: WorkflowConfigConverter<StateChartWorkflow> = (workflow, config) => {
  const states = transformObject(workflow.states, (stateConfig, stateName) => {
    const stateTransitions = generateStateTransitions(stateConfig.on ?? []);

    if (stateConfig.external) {
      if (stateConfig.final) {
        throw new InvalidStateChartException("An external state cannot be a final state at the same time!");
      }

      if (stateConfig.externalParticipants == null || stateConfig.externalParticipants.length === 0) {
        throw new InvalidStateChartException("External states must have participants defined!");
      }

      const transitionCondition = (ctx, event, {state}) => createExternalTransitionCondition(state, stateName, stateConfig.externalParticipants, stateConfig.externalCondition);
      const transitions = transformObject(stateTransitions, transitionConfig => ({...transitionConfig, cond: transitionCondition}));

      const states = generateExternalChildStates(stateConfig.externalParticipants);
      const childTransitions = generateExternalChildStateTransitions(stateConfig.externalParticipants);

      return {
        type: "parallel",
        on: {
          ...transitions,
          ...childTransitions
        },
        states
      };
    } else {
      return {
        type: stateConfig.final ? "final" : "atomic",
        on: stateTransitions
      };
    }
  });

  return {
    id: workflow.id,
    initial: workflow.initial,
    context: {},
    states
  } as MachineConfig<any, any, any>;
};

function generateStateTransitions(on: Record<string, EventObject | string>): Record<string, any> {
  return transformObject(on, transitionConfig => {
    const action = generateValidateAndAssignAction(transitionConfig.schema, transitionConfig.assign);
    const target = typeof (transitionConfig) === "string" ? transitionConfig : transitionConfig.target;

    if (target.includes(".")) {
      throw new InvalidStateChartException("State transitions to child states are not possible!");
    }

    return {
      target,
      actions: action ? [assign(action)] : []
    };
  });
}

function generateExternalChildStates(externalParticipants: ExternalParticipant[]): Record<string, any> {
  const states = {} as Record<string, any>;

  for (const externalParticipant of externalParticipants) {
    states[externalParticipant.id] = {
      states: {
        [STATE_NAME_EXTERNAL_PARTICIPANT_ACK]: { type: "final" }
      }
    };
  }

  return states;
}

function generateExternalChildStateTransitions(externalParticipants: ExternalParticipant[]): Record<string, string> {
  const transitions = {} as Record<string, any>;

  for (const externalParticipant of externalParticipants) {
    const ackEventName = `${EVENT_NAME_EXTERNAL_PARTICIPANT_ACK_PREFIX}${externalParticipant.id}`;
    const nackEventName = `${EVENT_NAME_EXTERNAL_PARTICIPANT_NACK_PREFIX}${externalParticipant.id}`;
    const statePath = `.${externalParticipant.id}.${STATE_NAME_EXTERNAL_PARTICIPANT_ACK}`

    const acceptanceAction: (context, event, meta) => void = generateValidateAndAssignAction(externalParticipant.acceptanceSchema, externalParticipant.assignOnAcceptance);
    const rejectionAction: (context, event, meta) => void = generateValidateAndAssignAction(externalParticipant.rejectionSchema, externalParticipant.assignOnRejection);

    transitions[ackEventName] = {
      target: statePath,
      actions: acceptanceAction ? [assign(acceptanceAction)] : []
    };

    transitions[nackEventName] = {
      target: undefined,
      actions: rejectionAction ? [assign(rejectionAction)] : []
    };
  }

  return transitions;
}

function generateValidateAndAssignAction(schema?: object, assign?: ObjectDefinition): ((context, event, meta) => void) | undefined {
  let action: (context, event, meta) => void = undefined;

  const ajv = new Ajv();

  if (schema != null || assign != null) {
    const validate = schema != null ? ajv.compile(schema) : null;

    action = (context, event) => {
      if (validate != null) {
        const valid = validate(event.payload);
        if (!valid) {
          throw new InvalidStateChartException(`Errors occurred during state transition: ${JSON.stringify(validate.errors)}`);
        }
      }

      if (assign != null) {
        return deepmerge.default(context, evaluateObjectDefinition(assign, {
          origin: event.origin,
          event: event.payload
        }));
      }
    };
  }

  return action;
}

function transformObject<T, R>(obj: Record<string, T>, transform: (T, string) => R): Record<string, R> {
  return Object.entries(obj).map(([key, value]) => {
    return [key, transform(value, key)] as [string, R];
  }).reduce((prev, [key, value]) => {
    prev[key] = value;
    return prev;
  }, {} as Record<string, R>);
}

export function evaluateObjectDefinition(objDefinition: ObjectDefinition, jsonPathContext: any): any {
  if (objDefinition.type !== "object" || objDefinition.properties == null) {
    if (objDefinition.jsonPath != null) {
      return JSONPath({ path: objDefinition.jsonPath, json: jsonPathContext, wrap: false });
    }

    return objDefinition.value;
  }

  return transformObject(
    objDefinition.properties ?? {},
    (obj: ObjectDefinition) => evaluateObjectDefinition(obj, jsonPathContext)
  );
}

function createExternalTransitionCondition(state, currentStateName: string, externalParticipants: ExternalParticipant[], condition?: ListCondition): boolean {
  if (condition == null) {
    // all participants must have accepted
    return externalParticipants
      .map(p => ({
        [currentStateName]: {
          [p.id]: STATE_NAME_EXTERNAL_PARTICIPANT_ACK
        }
      }))
      .every(statePath => state.matches(statePath));
  }

  if (condition.allOf != null) {
    const allOfMatches = condition.allOf
      .map(id => ({
        [currentStateName]: {
          [id]: STATE_NAME_EXTERNAL_PARTICIPANT_ACK
        }
      }))
      .every(statePath => state.matches(statePath));

    if (!allOfMatches) {
      return false;
    }
  }

  if (condition.anyOf != null) {
    const anyOfMatches = condition.anyOf
      .map(id => ({
        [currentStateName]: {
          [id]: STATE_NAME_EXTERNAL_PARTICIPANT_ACK
        }
      }))
      .some(statePath => state.matches(statePath));

    if (!anyOfMatches) {
      return false;
    }
  }

  if (condition.min != null || condition.max != null) {
    const count = externalParticipants
      .map(p => ({
        [currentStateName]: {
          [p.id]: STATE_NAME_EXTERNAL_PARTICIPANT_ACK
        }
      }))
      .filter(statePath => state.matches(statePath))
      .length;

    if (condition.min != null && count < condition.min) {
      return false;
    }

    if (condition.max != null && count > condition.max) {
      return false;
    }
  }

  return true;
}