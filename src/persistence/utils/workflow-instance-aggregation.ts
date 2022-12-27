import * as eventTypes from "src/persistence/persistence.events";
import { PersistenceEvent } from "src/persistence/utils/create-persistence-event";
import {
  WorkflowInstance,
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
    }
    if (eventTypes.receivedTransition.sameAs(eventType) && result != null) {
      const eventData = event.data as unknown as WorkflowInstanceTransition;
      result.participantsAccepted = [];
      result.participantsRejected = [];
      result.currentState = eventData.to;
      result.commitmentReference = eventData.commitmentReference;
      result.acceptedByParticipants = undefined;
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

    return null;
  }, null as WorkflowInstance);
}