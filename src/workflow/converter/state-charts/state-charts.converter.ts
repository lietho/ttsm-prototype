import Ajv from "ajv";
import { EventObject, ObjectDefinition, StateObject } from "src/workflow/dto/workflow-definition-dto";
import { assign, MachineConfig } from "xstate";
import { WorkflowConfigConverter } from "../workflow-config.converter";
import { StateChartWorkflow } from "./state-chart-workflow";
import * as deepmerge from "deepmerge";
import { JSONPath } from "jsonpath-plus";

export const convertStateChartWorkflowConfig: WorkflowConfigConverter<StateChartWorkflow> = (workflow, config) => {
  const states = transformObject(workflow.states, stateConfig => {
    const stateTransitions = generateStateTransitions(stateConfig.on);

    if (stateConfig.external) {
      if (stateConfig.final) {
        throw new Error("An external state cannot be a final state at the same time!");
      }

      // TODO: implement external states
      // TODO: add conditions to external states
      // TODO: add acceptance/rejection schema checks
      // TODO: add acceptance/rejection context assignments
      // TODO: add acceptance/rejection conditions

      return {
        type: "parallel",
        on: stateTransitions
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
  const ajv = new Ajv();

  return transformObject(on, transitionConfig => {
    let action: (context, event, meta) => void = undefined;

    if (transitionConfig.schema != null || transitionConfig.assign != null) {
      const validate = transitionConfig.schema != null ? ajv.compile(transitionConfig.schema) : null;

      action = (context, event) => {
        if (validate != null) {
          const valid = validate(event.payload);
          if (!valid) {
            throw new Error(`Errors occured during state transition: ${JSON.stringify(validate.errors)}`);
          }
        }

        if (transitionConfig.assign != null) {
          return deepmerge.default(context, evaluateObjectDefinition(transitionConfig.assign, {event: event.payload}));
        }
      }
    }

    return {
      target: typeof (transitionConfig) === "string" ? transitionConfig : transitionConfig.target,
      actions: action ? [assign(action)] : []
    };
  });
}

function transformObject<T, R>(obj: Record<string, T>, transform: (T) => R): Record<string, R> {
  return Object.entries(obj).map(([key, value]) => {
    return [key, transform(value)] as [string, R];
  }).reduce((prev, [key, value]) => {
    prev[key] = value;
    return prev;
  }, {} as Record<string, R>);
}

function evaluateObjectDefinition(objDefinition: ObjectDefinition, jsonPathContext: any): any {
  if (objDefinition.type !== "object") {
    if (objDefinition.jsonPath != null) {
      return JSONPath({path: objDefinition.jsonPath, json: jsonPathContext, wrap: false});
    }

    return objDefinition.value;
  }

  return transformObject(
    objDefinition.properties ?? {},
    (obj: ObjectDefinition) => evaluateObjectDefinition(obj, jsonPathContext)
  );
}