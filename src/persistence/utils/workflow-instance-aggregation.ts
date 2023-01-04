import * as eventTypes from "src/persistence/persistence.events";
import { PersistenceEvent } from "src/persistence/utils/create-persistence-event";
import { handleEvent } from "src/persistence/utils/handle-event";
import {
  Workflow,
  WorkflowInstance, WorkflowInstanceContext,
  WorkflowInstanceParticipantApproval,
  WorkflowInstanceParticipantDenial,
  WorkflowInstanceTransition,
  WorkflowInstanceTransitionParticipantApproval,
  WorkflowInstanceTransitionParticipantDenial
} from "src/workflow";

export function aggregateWorkflowInstanceEvents(events: PersistenceEvent<unknown>[]): WorkflowInstance {
  return events.reduce((result, event) => {
    const eventType = event?.type;

    if (eventTypes.launchWorkflowInstance.sameAs(eventType)) result = event.data as any as WorkflowInstance;
    if (eventTypes.receivedWorkflowInstance.sameAs(eventType)) result = { ...result, ...(event.data as any as WorkflowInstance) };

    if (eventTypes.localWorkflowInstanceAcceptedByRuleService.sameAs(eventType) && result.acceptedByRuleServices !== false) result.acceptedByRuleServices = true;
    if (eventTypes.localWorkflowInstanceRejectedByRuleService.sameAs(eventType)) result.acceptedByRuleServices = false;
    if (eventTypes.receivedWorkflowInstanceAcceptedByRuleService.sameAs(eventType) && result.acceptedByRuleServices !== false) result.acceptedByRuleServices = true;
    if (eventTypes.receivedWorkflowInstanceRejectedByRuleService.sameAs(eventType)) result.acceptedByRuleServices = false;
    if (eventTypes.workflowInstanceAcceptedByParticipant.sameAs(eventType)) result.participantsAccepted = [...(result.participantsAccepted ?? []), (event.data as any as WorkflowInstanceParticipantApproval)] as WorkflowInstanceParticipantApproval[];
    if (eventTypes.workflowInstanceRejectedByParticipant.sameAs(eventType)) result.participantsRejected = [...(result.participantsRejected ?? []), (event.data as any as WorkflowInstanceParticipantDenial)] as WorkflowInstanceParticipantDenial[];
    if (eventTypes.workflowInstanceAccepted.sameAs(eventType) && result.acceptedByParticipants !== false) result.acceptedByParticipants = true;
    if (eventTypes.workflowInstanceRejected.sameAs(eventType)) result.acceptedByParticipants = false;

    if (eventTypes.advanceWorkflowInstance.sameAs(eventType) && result != null) {
      const eventData = event.data as unknown as WorkflowInstanceTransition;
      result.participantsAccepted = [];
      result.participantsRejected = [];
      result.currentState = eventData.to;
      result.commitmentReference = eventData.commitmentReference;
      result.acceptedByParticipants = undefined;
      result.acceptedByRuleServices = undefined;
    }
    if (eventTypes.receivedTransition.sameAs(eventType) && result != null) {
      const eventData = event.data as unknown as WorkflowInstanceTransition;
      result.participantsAccepted = [];
      result.participantsRejected = [];
      result.currentState = eventData.to;
      result.commitmentReference = eventData.commitmentReference;
      result.acceptedByParticipants = undefined;
      result.acceptedByRuleServices = undefined;
    }
    if (eventTypes.localTransitionAcceptedByRuleService.sameAs(eventType) && result.acceptedByRuleServices !== false) result.acceptedByRuleServices = true;
    if (eventTypes.localTransitionRejectedByRuleService.sameAs(eventType)) result.acceptedByRuleServices = false;
    if (eventTypes.receivedTransitionAcceptedByRuleService.sameAs(eventType) && result.acceptedByRuleServices !== false) result.acceptedByRuleServices = true;
    if (eventTypes.receivedTransitionRejectedByRuleService.sameAs(eventType)) result.acceptedByRuleServices = false;
    if (eventTypes.transitionAcceptedByParticipant.sameAs(eventType)) result.participantsAccepted = [...(result.participantsAccepted ?? []), (event.data as any as WorkflowInstanceTransitionParticipantApproval)] as WorkflowInstanceTransitionParticipantApproval[];
    if (eventTypes.transitionRejectedByParticipant.sameAs(eventType)) result.participantsRejected = [...(result.participantsRejected ?? []), (event.data as any as WorkflowInstanceTransitionParticipantDenial)] as WorkflowInstanceTransitionParticipantDenial[];
    if (eventTypes.transitionAccepted.sameAs(eventType) && result.acceptedByRuleServices !== false) {
      result.acceptedByParticipants = true;
    }
    if (eventTypes.transitionRejected.sameAs(eventType) && result != null) {
      const eventData = event.data as unknown as WorkflowInstanceTransition;
      result.currentState = eventData.from;
      result.commitmentReference = eventData.commitmentReference;
      result.acceptedByParticipants = true;
    }

    return result;
  }, null as WorkflowInstance);
}

export function aggregateWorkflowInstanceIds(events: PersistenceEvent<unknown>[]): WorkflowInstanceContext[] {
  const instanceIdMapping = events.reduce((result, event) => {
    handleEvent(eventTypes.launchWorkflowInstance, event, event => result[event.data.consistencyId] = event.data.workflowId);
    handleEvent(eventTypes.receivedWorkflowInstance, event, event => result[event.data.consistencyId] = event.data.workflowId);

    return result;
  }, {} as Record<string, string>);

  return Object.entries(instanceIdMapping).map(([id, workflowId]) => ({workflowId, id}));
}

export function aggregateAllWorkflowInstanceEvents(events: PersistenceEvent<unknown>[]): Record<string, WorkflowInstance> {
  return events.reduce((result, event) => {
    handleEvent(eventTypes.launchWorkflowInstance, event, event => result[event.data.consistencyId] = event.data);
    handleEvent(eventTypes.receivedWorkflowInstance, event, event => result[event.data.consistencyId] = { ...result[event.data.consistencyId], ...event.data });

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
        result[event.data.id].commitmentReference = event.data.commitmentReference;
        result[event.data.id].acceptedByParticipants = undefined;
        result[event.data.id].acceptedByRuleServices = undefined;
      }
    });

    handleEvent(eventTypes.receivedTransition, event, event => {
      if (result[event.data.id] != null) {
        result[event.data.id].participantsAccepted = [];
        result[event.data.id].participantsRejected = [];
        result[event.data.id].currentState = event.data.to;
        result[event.data.id].commitmentReference = event.data.commitmentReference;
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
      result[event.data.id].currentState = event.data.transition.from;
      result[event.data.id].commitmentReference = event.data.commitmentReference;
      result[event.data.id].acceptedByParticipants = false;
    });

    return result;
  }, {} as Record<string, WorkflowInstance>);
}