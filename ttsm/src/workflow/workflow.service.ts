import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { getCurrentStateDefinition, getCurrentTransitionDefinition } from "src/workflow/utils";
import { createMachine, interpret, Interpreter, State } from "xstate";
import { OptimizerService } from "../optimizer";
import { PersistenceService } from "../persistence";

import { convertStateChartWorkflowConfig } from "./converter";

import {
  ExternalWorkflowInstanceTransition,
  OriginatingParticipant,
  SupportedWorkflowConfig,
  SupportedWorkflowModels,
  Workflow,
  WorkflowInstance,
  WorkflowInstanceTransition,
  WorkflowInstanceTransitionDto
} from "./models";

/**
 * The core of the entire system. The workflow service is responsible for advancing existing workflow instances, creating
 * new workflows or launching new workflow instances across multiple counterparties.
 */
@Injectable()
export class WorkflowService {

  private readonly logger = new Logger(WorkflowService.name);

  constructor(private persistence: PersistenceService,
              private optimizer: OptimizerService) {
  }

  /**
   * Proposes a new workflow. A workflow has to be accepted by all participants before being used.
   * @param workflow
   * @param config
   */
  async proposeWorkflow(workflow: SupportedWorkflowModels, config?: SupportedWorkflowConfig) {
    let workflowModel: SupportedWorkflowModels;
    const workflowModelType = config?.type ?? "STATE_CHARTS";
    switch (workflowModelType) {
      case "STATE_CHARTS":
        // convert to check validity and convertability of the supplied workflow definition
        convertStateChartWorkflowConfig(workflow, config);
        workflowModel = workflow;
        break;
      default:
        throw new BadRequestException(`Workflow model type "${workflowModelType}" it not supported. Only raw state charts are supported right now.`);
    }

    // Perform optimizations
    workflowModel = this.optimizer.optimize(workflowModel, config?.optimizer);

    // Propose the workflow to all other participants
    return await this.persistence.proposeWorkflow({
      config,
      workflowModel
    });
  }

  /**
   * Launches a new instance of a given workflow if the workflow has been accepted.
   * @param workflowId
   */
  async launchWorkflowInstance(workflowId: string) {
    const workflow = await this.persistence.getWorkflowById(workflowId);
    if (workflow == null) throw new NotFoundException(`Workflow with ID "${workflowId}" does not exist`);

    const service = this.getWorkflowStateMachine(workflow.workflowModel, workflow.config);

    return await this.persistence.launchWorkflowInstance({
      workflowId,
      organizationId: workflow.organizationId,
      currentState: service.initialState
    });
  }

  /**
   * Requests to advance the workflow instance to the next state.
   * @param workflowId
   * @param instanceId
   * @param transition
   */
  async advanceWorkflowInstance(workflowId: string, instanceId: string, transition: WorkflowInstanceTransitionDto) {
    const workflow = await this.persistence.getWorkflowById(workflowId);
    if (workflow == null) throw new NotFoundException(`Workflow with ID "${workflowId}" does not exist`);

    const workflowInstance = await this.persistence.getWorkflowInstanceById(workflowId, instanceId);
    if (workflowInstance == null) throw new NotFoundException(`Instance with ID "${instanceId}" does not exist for workflow "${workflowId}"`);

    const { previousState, currentState } = this.internalAdvanceWorkflowInstance(workflow, workflowInstance, transition);

    const transitionDefinition = getCurrentTransitionDefinition(previousState, transition.event, workflow.workflowModel);

    if (typeof(transitionDefinition) !== "string" && transitionDefinition.external) {
      throw new Error("This event is expected to be triggered by an external service! Triggering an external event locally is not possible.");
    }

    await this.persistence.advanceWorkflowInstanceState({
      id: instanceId,
      workflowId: workflowId,
      from: previousState,
      to: currentState,
      event: transition.event,
      payload: transition.payload
    } as WorkflowInstanceTransition);

    const updatedWorkflowInstance = await this.persistence.getWorkflowInstanceById(workflowId, instanceId);
    return updatedWorkflowInstance;
  }

  /**
   * Handles transitions that are incoming from another participant.
   * @param workflow
   * @param workflowInstance
   * @param transition
   * @param externalIncomingTransition
   */
  async onExternalAdvanceWorkflowInstance(workflow: Workflow, workflowInstance: WorkflowInstance, transition: WorkflowInstanceTransitionDto, externalIncomingTransition: ExternalWorkflowInstanceTransition) {
    // check if the currentState has child states which is the only case for active external states
    const isCurrentStateExternal = typeof (workflowInstance.currentState) !== "string" && typeof (workflowInstance.currentState.value) !== "string";

    if (isCurrentStateExternal) {
      return transition;
    }

    const transitionDefinitionBefore = getCurrentTransitionDefinition(workflowInstance.currentState, transition.event, workflow.workflowModel);

    if (transitionDefinitionBefore == null || typeof(transitionDefinitionBefore) !== "string" && !transitionDefinitionBefore.external) {
      // send rejection message back to originator
      throw new Error("The current state doesn't expect any external events!");
    }

    const { previousState, currentState } = this.internalAdvanceWorkflowInstance(workflow, workflowInstance, transition, externalIncomingTransition.originatingParticipant);

    await this.persistence.advanceWorkflowInstanceState({
      id: workflowInstance.id,
      workflowId: workflow.id,
      from: previousState,
      to: currentState,
      event: transition.event,
      payload: transition.payload,
      originatingExternalTransition: externalIncomingTransition
    } as WorkflowInstanceTransition);
  }


  /**
   * Handles acknowledge responses from an external participant for an external event that was originally dispatched by this instance.
   * executes the locally needed acknowledgement state transition and dispatches the corresponding advanceWorkflowInstance event to the persistence layer.
   * @param workflowId
   * @param instanceId
   * @param transition
   * @param externalIncomingTransition
   */
  async onExternalTransitionAcknowledge(workflowId: string, instanceId: string, transition: WorkflowInstanceTransitionDto, originatingParticipant: OriginatingParticipant) {
    const workflow = await this.persistence.getWorkflowById(workflowId);
    if (workflow == null) throw new NotFoundException(`Workflow with ID "${workflowId}" does not exist`);

    const workflowInstance = await this.persistence.getWorkflowInstanceById(workflowId, instanceId);
    if (workflowInstance == null) throw new NotFoundException(`Instance with ID "${instanceId}" does not exist for workflow "${workflowId}"`);

    const stateDefinition = getCurrentStateDefinition(workflowInstance.currentState, workflow.workflowModel);

    if (!stateDefinition.external) {
      throw new Error("External acknowledgements can only be accepted on external events!");
    }

    const { previousState, currentState } = this.internalAdvanceWorkflowInstance(workflow, workflowInstance, transition, originatingParticipant);

    await this.persistence.advanceWorkflowInstanceState({
      id: instanceId,
      workflowId: workflowId,
      from: previousState,
      to: currentState,
      event: transition.event,
      payload: transition.payload
    } as WorkflowInstanceTransition);
  }

  private internalAdvanceWorkflowInstance(workflow: Workflow, workflowInstance: WorkflowInstance, transition: WorkflowInstanceTransitionDto, originatingParticipant?: OriginatingParticipant): TransitionResult {
    try {
      const service = this.getWorkflowStateMachine(workflow.workflowModel, workflow.config);
      const previousState = workflowInstance.currentState == null ? service.initialState : State.create(workflowInstance.currentState as any) as State<any, any>;

      service.start(previousState);
      const currentState = service.send(transition.event, {
        origin: originatingParticipant,
        payload: transition.payload
      }) as State<any, any>;
      service.stop();

      return { previousState, currentState } as TransitionResult;
    } catch (e) {
      this.logger.warn(`Could not perform state transition`, e);
      throw new BadRequestException(`Could not perform state transition`);
    }
  }

  async getWorkflowStateAt(id: string, at: Date) {
    const state = await this.persistence.getWorkflowStateAt(id, at);
    if (state == null) throw new NotFoundException(`Workflow "${id}" did not exist at ${at.toISOString()}`);
    return state;
  }

  async getWorkflowInstanceStateAt(workflowId: string, id: string, at: Date) {
    const state = await this.persistence.getWorkflowInstanceStateAt(workflowId, id, at);
    if (state == null) throw new NotFoundException(`Workflow instance "${id}" did not exist at ${at.toISOString()}`);
    return state;
  }

  /**
   * Returns all payloads attached to state transitions until the given point in time.
   * @param id Workflow instance ID.
   * @param until Point in time until which should be search.
   */
  async getWorkflowInstanceStateTransitionPayloadsUntil(workflowId: string, id: string, until: Date) {
    const result = await this.persistence.getWorkflowInstanceStateTransitionPayloadsUntil(workflowId, id, until);
    if (result == null) throw new NotFoundException(`Workflow instance "${id}" did not exist at ${until.toISOString()}`);
    return result;
  }

  /**
   * Returns all currently available workflows.
   */
  async getWorkflows() {
    return await this.persistence.getAllWorkflows();
  }

  /**
   * Returns the workflow with the given ID.
   * @param id Workflow ID.
   */
  async getWorkflow(id: string) {
    const workflow = await this.persistence.getWorkflowById(id);
    if (workflow == null) throw new NotFoundException(`Workflow with ID "${id}" does not exist`);
    return workflow;
  }

  /**
   * Returns the workflow instance with the given ID.
   * @param workflowId Workflow ID.
   * @param instanceId Workflow instance ID.
   */
  async getWorkflowInstance(workflowId: string, instanceId: string) {
    const workflow = await this.persistence.getWorkflowById(workflowId);
    if (workflow == null) throw new NotFoundException(`Workflow with ID "${workflowId}" does not exist`);
    const instance = await this.persistence.getWorkflowInstanceById(workflowId, instanceId);
    if (instance == null) throw new NotFoundException(`Workflow instance with ID "${instanceId}" does not exist on workflow "${workflowId}"`);
    return instance;
  }

  /**
   * Returns all workflow instances of the workflow with the given ID.
   * @param workflowId Workflow ID.
   */
  async getWorkflowInstancesOfWorkflow(workflowId: string) {
    return await this.persistence.getWorkflowInstancesOfWorkflow(workflowId);
  }

  private getWorkflowStateMachine(workflowModel: SupportedWorkflowModels, config?: SupportedWorkflowConfig): Interpreter<any, any, any, any, any> {
    const workflowStateChart = convertStateChartWorkflowConfig(workflowModel, config);
    const stateMachine = createMachine(workflowStateChart);

    return interpret(stateMachine);
  }
}

interface TransitionResult {
  previousState: State<any, any>;
  currentState: State<any, any>;
}