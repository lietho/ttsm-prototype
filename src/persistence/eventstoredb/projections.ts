import { randomUUIDv4 } from "src/core/utils";
import * as eventTypes from "src/persistence/persistence.events";

export const WORKFLOWS_PROJECTION_NAME = 'custom-projections.workflows.' + randomUUIDv4();
export const WORKFLOWS_PROJECTION = `
    fromAll()
        .when({
            $init: () => ({ workflows: {} }),
            "${eventTypes.proposeWorkflow.type}": (s, e) => { s.workflows[e.data.consistencyId] = e.data; },
            "${eventTypes.receivedWorkflow.type}": (s, e) => { s.workflows[e.data.consistencyId] = { ...s.workflows[e.data.consistencyId], ...e.data }; },
            "${eventTypes.localWorkflowAcceptedByRuleService.type}": (s, e) => { if (s.workflows[e.data.id].acceptedByRuleServices !== false) s.workflows[e.data.id].acceptedByRuleServices = true; },
            "${eventTypes.localWorkflowRejectedByRuleService.type}": (s, e) => { s.workflows[e.data.id].acceptedByRuleServices = false; },
            "${eventTypes.receivedWorkflowAcceptedByRuleService.type}": (s, e) => { if (s.workflows[e.data.id].acceptedByRuleServices !== false) s.workflows[e.data.id].acceptedByRuleServices = true; },
            "${eventTypes.receivedWorkflowRejectedByRuleService.type}": (s, e) => { s.workflows[e.data.id].acceptedByRuleServices = false; },
            "${eventTypes.workflowAcceptedByParticipant.type}": (s, e) => { s.workflows[e.data.id].participantsAccepted = [...(s.workflows[e.data.id].participantsAccepted || []), e.data]; },
            "${eventTypes.workflowRejectedByParticipant.type}": (s, e) => { s.workflows[e.data.id].participantsRejected = [...(s.workflows[e.data.id].participantsRejected || []), e.data] },
            "${eventTypes.workflowAccepted.type}": (s, e) => { if (s.workflows[e.data.id].acceptedByParticipants !== false) s.workflows[e.data.id].acceptedByParticipants = true; },
            "${eventTypes.workflowRejected.type}": (s, e) => { s.workflows[e.data.id].acceptedByParticipants = false; },
        })
        .transformBy((state) => state.workflows)
        .outputState();
  `;

export const WORKFLOW_INSTANCES_PROJECTION_NAME = 'custom-projections.instances.' + randomUUIDv4();
export const WORKFLOW_INSTANCES_PROJECTION = `
    fromAll()
        .when({
            $init: () => ({ instances: {} }),
            "${eventTypes.launchWorkflowInstance.type}": (s, e) => { s.instances[e.data.consistencyId] = e.data; },
            "${eventTypes.receivedWorkflowInstance.type}": (s, e) => { s.instances[e.data.consistencyId] = { ...s.instances[e.data.consistencyId], ...e.data }; },
            "${eventTypes.localWorkflowInstanceAcceptedByRuleService.type}": (s, e) => { if (s.instances[e.data.id].acceptedByRuleServices !== false) s.instances[e.data.id].acceptedByRuleServices = true; },
            "${eventTypes.localWorkflowInstanceRejectedByRuleService.type}": (s, e) => { s.instances[e.data.id].acceptedByRuleServices = false; },
            "${eventTypes.receivedWorkflowInstanceAcceptedByRuleService.type}": (s, e) => { if (s.instances[e.data.id].acceptedByRuleServices !== false) s.instances[e.data.id].acceptedByRuleServices = true; },
            "${eventTypes.receivedWorkflowInstanceRejectedByRuleService.type}": (s, e) => { s.instances[e.data.id].acceptedByRuleServices = false; },
            "${eventTypes.workflowInstanceAcceptedByParticipant.type}": (s, e) => { s.instances[e.data.id].participantsAccepted = [...(s.instances[e.data.id].participantsAccepted || []), e.data]; },
            "${eventTypes.workflowInstanceRejectedByParticipant.type}": (s, e) => { s.instances[e.data.id].participantsRejected = [...(s.instances[e.data.id].participantsRejected || []), e.data]; },
            "${eventTypes.workflowInstanceAccepted.type}": (s, e) => { if (s.instances[e.data.id].acceptedByParticipants !== false) s.instances[e.data.id].acceptedByParticipants = true; },
            "${eventTypes.workflowInstanceRejected.type}": (s, e) => { s.instances[e.data.id].acceptedByParticipants = false; },
            "${eventTypes.advanceWorkflowInstance.type}": (s, e) => {
              s.instances[e.data.id].participantsAccepted = [];
              s.instances[e.data.id].participantsRejected = [];
              s.instances[e.data.id].currentState = e.data.to;
              s.instances[e.data.id].commitmentReference = e.data.commitmentReference;
              s.instances[e.data.id].acceptedByParticipants = undefined;
            },
            "${eventTypes.receivedTransition.type}": (s, e) => {
              s.instances[e.data.id].participantsAccepted = [];
              s.instances[e.data.id].participantsRejected = [];
              s.instances[e.data.id].currentState = e.data.to;
              s.instances[e.data.id].commitmentReference = e.data.commitmentReference;
              s.instances[e.data.id].acceptedByParticipants = undefined;
            },
            "${eventTypes.localTransitionAcceptedByRuleService.type}": (s, e) => { if (s.instances[e.data.id].acceptedByRuleServices !== false) s.instances[e.data.id].acceptedByRuleServices = true; },
            "${eventTypes.localTransitionRejectedByRuleService.type}": (s, e) => { s.instances[e.data.id].acceptedByRuleServices = false; },
            "${eventTypes.receivedTransitionAcceptedByRuleService.type}": (s, e) => { if (s.instances[e.data.id].acceptedByRuleServices !== false) s.instances[e.data.id].acceptedByRuleServices = true; },
            "${eventTypes.receivedTransitionRejectedByRuleService.type}": (s, e) => { s.instances[e.data.id].acceptedByRuleServices = false; },
            "${eventTypes.transitionAcceptedByParticipant.type}": (s, e) => { s.instances[e.data.id].participantsAccepted = [...(s.instances[e.data.id].participantsAccepted || []), e.data]; },
            "${eventTypes.transitionRejectedByParticipant.type}": (s, e) => { s.instances[e.data.id].participantsRejected = [...(s.instances[e.data.id].participantsRejected || []), e.data]; },
            "${eventTypes.transitionAccepted.type}": (s, e) => { if (s.instances[e.data.id].acceptedByParticipants !== false) s.instances[e.data.id].acceptedByParticipants = true; },
            "${eventTypes.transitionRejected.type}": (s, e) => {
              s.instances[e.data.id].currentState = e.data.from;
              s.instances[e.data.id].commitmentReference = e.data.commitmentReference;
              s.instances[e.data.id].acceptedByParticipants = true;
            },
        })
        .transformBy((state) => state.instances)
        .outputState();
  `;