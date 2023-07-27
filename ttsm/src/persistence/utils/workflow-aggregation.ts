import * as eventTypes from "src/persistence/persistence.events";
import { Workflow } from "src/workflow";
import { PersistenceEvent } from "./create-persistence-event";
import { handleEvent } from "./handle-event";

export function aggregateWorkflowEvents(events: PersistenceEvent<unknown>[]): Workflow {
  const workflows = aggregateAllWorkflowEvents(events);
  const workflowIds = Object.keys(workflows);

  if (workflowIds.length > 1) {
    throw new Error("Couldn't aggregate to a unique workflow!");
  }

  if (workflowIds.length == 0) {
    return null;
  }

  return workflows[workflowIds[0]];
}

export function aggregateAllWorkflowEvents(events: PersistenceEvent<unknown>[]): Record<string, Workflow> {
  return events.reduce((result, event) => {
    handleEvent(eventTypes.proposeWorkflow, event, event => result[event.data.consistencyId] = { ...event.data });
    handleEvent(eventTypes.receivedWorkflow, event, event => result[event.data.consistencyId] = { ...event.data });
    handleEvent(eventTypes.localWorkflowAcceptedByRuleService, event, event => {
      if (result[event.data.id].acceptedByRuleServices !== false) {
        result[event.data.id].acceptedByRuleServices = true;
      }
    });
    handleEvent(eventTypes.localWorkflowRejectedByRuleService, event, event => result[event.data.id].acceptedByRuleServices = false);
    handleEvent(eventTypes.receivedWorkflowAcceptedByRuleService, event, event => {
      if (result[event.data.id].acceptedByRuleServices !== false) {
        result[event.data.id].acceptedByRuleServices = true;
      }
    });
    handleEvent(eventTypes.receivedWorkflowRejectedByRuleService, event, event => result[event.data.id].acceptedByRuleServices = false);
    handleEvent(eventTypes.workflowAcceptedByParticipant, event, event => result[event.data.id].participantsAccepted = [...(result[event.data.id].participantsAccepted ?? []), event.data]);
    handleEvent(eventTypes.workflowRejectedByParticipant, event, event => result[event.data.id].participantsRejected = [...(result[event.data.id].participantsRejected ?? []), event.data]);
    handleEvent(eventTypes.workflowAccepted, event, event => {
      if (result[event.data.id].acceptedByParticipants !== false) {
        result[event.data.id].acceptedByParticipants = true;
      }
    });
    handleEvent(eventTypes.workflowRejected, event, event => result[event.data.id].acceptedByParticipants = false);

    return result;
  }, {} as Record<string, Workflow>);
}