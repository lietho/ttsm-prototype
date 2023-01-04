import * as eventTypes from "src/persistence/persistence.events";
import { PersistenceEvent, } from "./create-persistence-event";
import { handleEvent } from "./handle-event";
import { Workflow, WorkflowProposalParticipantApproval, WorkflowProposalParticipantDenial } from "src/workflow";

export function aggregateWorkflowEvents(events: PersistenceEvent<unknown>[]): Workflow {
  return events.reduce((result, event) => {
    const eventType = event?.type;

    if (eventTypes.proposeWorkflow.sameAs(eventType)) result = event.data as any as Workflow;
    if (eventTypes.receivedWorkflow.sameAs(eventType)) result = { ...result, ...(event.data as any as Workflow) };
    if (eventTypes.localWorkflowAcceptedByRuleService.sameAs(eventType) && result.acceptedByRuleServices !== false) result.acceptedByRuleServices = true;
    if (eventTypes.localWorkflowRejectedByRuleService.sameAs(eventType)) result.acceptedByRuleServices = false;
    if (eventTypes.receivedWorkflowAcceptedByRuleService.sameAs(eventType) && result.acceptedByRuleServices !== false) result.acceptedByRuleServices = true;
    if (eventTypes.receivedWorkflowRejectedByRuleService.sameAs(eventType)) result.acceptedByRuleServices = false;
    if (eventTypes.workflowAcceptedByParticipant.sameAs(eventType)) result.participantsAccepted = [...(result.participantsAccepted ?? []), (event.data as any as WorkflowProposalParticipantApproval)];
    if (eventTypes.workflowRejectedByParticipant.sameAs(eventType)) result.participantsRejected = [...(result.participantsRejected ?? []), (event.data as any as WorkflowProposalParticipantDenial)];
    if (eventTypes.workflowAccepted.sameAs(eventType) && result.acceptedByParticipants !== false) result.acceptedByParticipants = true;
    if (eventTypes.workflowRejected.sameAs(eventType)) result.acceptedByParticipants = false;

    return result;
  }, null as Workflow);
}

export function aggregateAllWorkflowEvents(events: PersistenceEvent<unknown>[]): Record<string, Workflow> {
  return events.reduce((result, event) => {
    handleEvent(eventTypes.proposeWorkflow, event, event => result[event.data.consistencyId] = event.data as any as Workflow);
    handleEvent(eventTypes.receivedWorkflow, event, event => result[event.data.consistencyId] = { ...result[event.data.consistencyId], ...(event.data as any as Workflow) });
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