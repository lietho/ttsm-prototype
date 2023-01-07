import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createMachine, interpret, Interpreter, MachineConfig, State } from "xstate";

import { SupportedWorkflowConfig, SupportedWorkflowModels, WorkflowInstanceDto, WorkflowInstanceTransitionDto } from './models';

import { convertStateChartWorkflowConfig, StateChartWorkflow } from './converter';
import { OptimizerService } from '../optimizer';
import { PersistenceService } from '../persistence';

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
    const workflowModelType = config?.type ?? 'STATE_CHARTS';
    switch (workflowModelType) {
      case 'STATE_CHARTS':
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
    return await this.persistence.proposeWorkflow({ config, workflowModel });
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
    if (transition.event.includes(".")) {
      throw new BadRequestException("Invoking child events is not allowed!");
    }

    if (transition.event.startsWith("$")) {
      throw new BadRequestException("Invoking internal events is not allowed!");
    }

    const workflow = await this.persistence.getWorkflowById(workflowId);
    if (workflow == null) throw new NotFoundException(`Workflow with ID "${workflowId}" does not exist`);

    const workflowInstance = await this.persistence.getWorkflowInstanceById(workflowId, instanceId);
    if (workflowInstance == null) throw new NotFoundException(`Instance with ID "${instanceId}" does not exist for workflow "${workflowId}"`);

    let previousState;

    try {
      const service = this.getWorkflowStateMachine(workflow.workflowModel, workflow.config);
      previousState = workflowInstance.currentState == null ? service.initialState : State.create(workflowInstance.currentState as any) as any;
      service.start(previousState);

      // The commitment reference is no longer relevant for this new transition. It will be replaced later on.
      delete workflowInstance.commitmentReference;
      delete workflowInstance.acceptedByRuleServices;
      delete workflowInstance.acceptedByParticipants;
      workflowInstance.participantsAccepted = [];
      workflowInstance.participantsRejected = [];
      workflowInstance.currentState = service.send(transition.event, {payload: transition.payload }) as any;
      service.stop();
    } catch (e) {
      this.logger.warn(`Could not perform state transition`, e);
      throw new BadRequestException(`Could not perform state transition`);
    }

    await this.persistence.advanceWorkflowInstanceState({
      id: instanceId,
      workflowId: workflowId,
      from: previousState,
      to: workflowInstance.currentState,
      event: transition.event,
      payload: transition.payload
    });
    return workflowInstance;
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
