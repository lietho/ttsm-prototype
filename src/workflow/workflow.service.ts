import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createMachine, interpret, MachineConfig, State } from 'xstate';

import { SupportedWorkflowConfig, SupportedWorkflowModels, WorkflowInstanceConfig, WorkflowInstanceTransitionConfig } from './models';

import { convertStateChartWorkflowConfig, StateChartWorkflow } from './converter';
import { OptimizerService } from '../optimizer';
import { PersistenceService } from '../persistence';
import { RulesService } from '../rules';

/**
 * The core of the entire system. The workflow service is responsible for advancing existing workflow instances, creating
 * new workflows or launching new workflow instances across multiple counterparties.
 */
@Injectable()
export class WorkflowService {

  private readonly logger = new Logger(WorkflowService.name);

  constructor(private persistence: PersistenceService,
              private optimizer: OptimizerService,
              private rules: RulesService) {
  }

  /**
   * Proposes a new workflow. A workflow has to be accepted by all participants before being used.
   * @param workflow
   * @param config
   */
  async proposeWorkflow(workflow: SupportedWorkflowModels, config?: SupportedWorkflowConfig) {
    let workflowModel: MachineConfig<any, any, any>;
    const workflowModelType = config?.type ?? 'STATE_CHARTS';
    switch (workflowModelType) {
      case 'STATE_CHARTS':
        workflowModel = convertStateChartWorkflowConfig(workflow as StateChartWorkflow, config);
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
   * @param instanceConfig
   */
  async launchWorkflowInstance(workflowId: string, instanceConfig?: WorkflowInstanceConfig) {
    const workflow = await this.persistence.getWorkflowById(workflowId);
    if (workflow == null) throw new NotFoundException(`Workflow with ID "${workflowId}" does not exist`);

    // Let the rule engine validate if everything is fine or not
    const errors = await this.rules.validateLaunchWorkflowInstance({
      consistencyId: workflow.consistencyId,
      workflowModel: workflow.workflowModel,
      config: workflow.config
    });
    if (errors.length > 0) {
      throw new ConflictException(`The rule service(s) reported one or more errors: ${JSON.stringify(errors.map((curr) => `[EC-${curr.errorCode}] ${curr.reason}`).join(', '))}`);
    }

    return await this.persistence.launchWorkflowInstance({
      workflowId,
      currentState: instanceConfig?.initialState
    });
  }

  async advanceWorkflowInstance(workflowId: string, instanceId: string, transition: WorkflowInstanceTransitionConfig) {
    const workflow = await this.persistence.getWorkflowById(workflowId);
    if (workflow == null) throw new NotFoundException(`Workflow with ID "${workflowId}" does not exist`);

    const workflowInstance = await this.persistence.getWorkflowInstanceById(instanceId);
    if (workflowInstance == null) throw new NotFoundException(`Instance with ID "${instanceId}" does not exist for workflow "${workflowId}"`);

    const stateMachine = createMachine(workflow.workflowModel);
    const previousState = workflowInstance.currentState == null ? stateMachine.initialState : State.create(workflowInstance.currentState as any) as any;

    // Let the rule engine validate if everything is fine or not
    const errors = await this.rules.validatePerformStateTransition({
      id: instanceId,
      from: previousState,
      event: transition.event,
      payload: transition.payload
    });
    if (errors.length > 0) {
      throw new ConflictException(`The rule service(s) reported one or more errors: ${JSON.stringify(errors.map((curr) => `[EC-${curr.errorCode}] ${curr.reason}`).join(', '))}`);
    }

    try {
      const service = interpret(stateMachine);
      service.start(previousState);

      // The commitment reference is no longer relevant for this new transition. It will be replaced later on.
      delete workflowInstance.commitmentReference;
      workflowInstance.currentState = service.send(transition.event, transition.payload) as any;
      service.stop();
    } catch (e) {
      this.logger.warn(`Could not perform state transition`, e);
      throw new BadRequestException(`Could not perform state transition`);
    }

    await this.persistence.advanceWorkflowInstanceState({
      id: instanceId,
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

  async getWorkflowInstanceStateAt(id: string, at: Date) {
    const state = await this.persistence.getWorkflowInstanceStateAt(id, at);
    if (state == null) throw new NotFoundException(`Workflow instance "${id}" did not exist at ${at.toISOString()}`);
    return state;
  }

  /**
   * Returns all payloads attached to state transitions until the given point in time.
   * @param id Workflow instance ID.
   * @param until Point in time until which should be search.
   */
  async getWorkflowInstanceStateTransitionPayloadsUntil(id: string, until: Date) {
    const result = await this.persistence.getWorkflowInstanceStateTransitionPayloadsUntil(id, until);
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
    const instance = await this.persistence.getWorkflowInstanceById(instanceId);
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
}
