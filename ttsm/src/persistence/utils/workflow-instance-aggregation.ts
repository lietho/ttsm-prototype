import * as eventTypes from "src/persistence/persistence.events";
import { PersistenceEvent } from "src/persistence/utils/create-persistence-event";
import { handleEvent } from "src/persistence/utils/handle-event";
import { WorkflowInstance, WorkflowInstanceContext } from "src/workflow";

export function aggregateWorkflowInstanceEvents(events: PersistenceEvent<unknown>[]): WorkflowInstance {
  const instances = aggregateAllWorkflowInstanceEvents(events);
  const instanceIds = Object.keys(instances);

  if (instanceIds.length > 1) {
    throw new Error("Couldn't aggregate to a unique workflow instance!");
  }

  if (instanceIds.length == 0) {
    return null;
  }

  return instances[instanceIds[0]];
}

export function aggregateWorkflowInstanceIds(events: PersistenceEvent<unknown>[]): WorkflowInstanceContext[] {
  const instanceIdMapping = events.reduce((result, event) => {
    handleEvent(eventTypes.launchWorkflowInstance, event, event => result[event.data.consistencyId] = {
      workflowId: event.data.workflowId,
      organizationId: event.data.organizationId
    });
    handleEvent(eventTypes.receivedWorkflowInstance, event, event => result[event.data.consistencyId] = {
      workflowId: event.data.workflowId,
      organizationId: event.data.organizationId
    });

    return result;
  }, {} as Record<string, { workflowId: string, organizationId: string }>);

  return Object.entries(instanceIdMapping).map(([id, { workflowId, organizationId }]) => ({ organizationId, workflowId, id }));
}

export function aggregateAllWorkflowInstanceEvents(events: PersistenceEvent<unknown>[]): Record<string, WorkflowInstance> {
  return events.reduce((result, event) => {
    handleEvent(eventTypes.launchWorkflowInstance, event, event => result[event.data.consistencyId] = {
      ...event.data
    });
    handleEvent(eventTypes.receivedWorkflowInstance, event, event => result[event.data.consistencyId] = {
      ...event.data
    });

    handleEvent(eventTypes.localWorkflowInstanceAcceptedByRuleService, event, event => {
      if (result[event.data.id].acceptedByRuleServices !== false) {
        result[event.data.id].acceptedByRuleServices = true;
      }
    });
    handleEvent(eventTypes.localWorkflowInstanceRejectedByRuleService, event, event => result[event.data.id].acceptedByRuleServices = false);
    handleEvent(eventTypes.receivedWorkflowInstanceAcceptedByRuleService, event, event => {
      if (result[event.data.id].acceptedByRuleServices !== false) {
        result[event.data.id].acceptedByRuleServices = true;
      }
    });
    handleEvent(eventTypes.receivedWorkflowInstanceRejectedByRuleService, event, event => result[event.data.id].acceptedByRuleServices = false);
    handleEvent(eventTypes.workflowInstanceAcceptedByParticipant, event, event => result[event.data.id].participantsAccepted = [...(result[event.data.id].participantsAccepted ?? []), event.data]);
    handleEvent(eventTypes.workflowInstanceRejectedByParticipant, event, event => result[event.data.id].participantsRejected = [...(result[event.data.id].participantsRejected ?? []), event.data]);
    handleEvent(eventTypes.workflowInstanceAccepted, event, event => {
      if (result[event.data.id].acceptedByParticipants !== false) {
        result[event.data.id].acceptedByParticipants = true;
      }
    });
    handleEvent(eventTypes.workflowInstanceRejected, event, event => result[event.data.id].acceptedByParticipants = false);

    handleEvent(eventTypes.advanceWorkflowInstance, event, event => {
      if (result[event.data.id] != null) {
        result[event.data.id].participantsAccepted = [];
        result[event.data.id].participantsRejected = [];
        result[event.data.id].currentState = event.data.to;
        result[event.data.id].commitment = event.data.commitment;
        result[event.data.id].acceptedByParticipants = undefined;
        result[event.data.id].acceptedByRuleServices = undefined;
      }
    });

    handleEvent(eventTypes.receivedTransition, event, event => {
      if (result[event.data.id] != null) {
        result[event.data.id].participantsAccepted = [];
        result[event.data.id].participantsRejected = [];
        result[event.data.id].currentState = event.data.to;
        result[event.data.id].commitment = event.data.commitment;
        result[event.data.id].acceptedByParticipants = undefined;
        result[event.data.id].acceptedByRuleServices = undefined;
      }
    });

    handleEvent(eventTypes.localTransitionAcceptedByRuleService, event, event => {
      if (result[event.data.id].acceptedByRuleServices !== false) {
        result[event.data.id].acceptedByRuleServices = true;
      }
    });
    handleEvent(eventTypes.localTransitionRejectedByRuleService, event, event => result[event.data.id].acceptedByRuleServices = false);
    handleEvent(eventTypes.receivedTransitionAcceptedByRuleService, event, event => {
      if (result[event.data.id].acceptedByRuleServices !== false) {
        result[event.data.id].acceptedByRuleServices = true;
      }
    });
    handleEvent(eventTypes.receivedTransitionRejectedByRuleService, event, event => result[event.data.id].acceptedByRuleServices = false);
    handleEvent(eventTypes.transitionAcceptedByParticipant, event, event => result[event.data.id].participantsAccepted = [...(result[event.data.id].participantsAccepted ?? []), event.data]);
    handleEvent(eventTypes.transitionRejectedByParticipant, event, event => result[event.data.id].participantsRejected = [...(result[event.data.id].participantsRejected ?? []), event.data]);
    handleEvent(eventTypes.transitionAccepted, event, event => {
      if (result[event.data.id].acceptedByParticipants !== false) {
        result[event.data.id].acceptedByParticipants = true;
      }
    });
    handleEvent(eventTypes.transitionRejected, event, event => {
      result[event.data.id].commitment = event.data.commitment;
      result[event.data.id].acceptedByParticipants = false;
    });

    return result;
  }, {} as Record<string, WorkflowInstance>);
}