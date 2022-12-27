import * as eventTypes from "src/persistence/persistence.events";
import { PersistenceEvent } from "src/persistence/utils/create-persistence-event";
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

    return null;
  }, null as Workflow);
}