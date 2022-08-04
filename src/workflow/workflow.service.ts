import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { createMachine, MachineConfig, State, StateValue } from 'xstate';

import {
  SupportedWorkflowConfig,
  SupportedWorkflowModels,
  WorkflowInstanceConfig,
  WorkflowInstanceTransitionConfig
} from './models';
import {
  acceptAdvanceWorkflowInstance,
  acceptWorkflow,
  acceptWorkflowInstance,
  advanceWorkflowInstance,
  createWorkflow,
  launchWorkflowInstance,
  rejectAdvanceWorkflowInstance,
  rejectWorkflow,
  rejectWorkflowInstance
} from './workflow.actions';

import { convertStateChartWorkflowConfig, StateChartWorkflow } from './converter';
import { WorkflowRepository } from './workflow.repository';
import { OptimizerService } from '../optimizer';
import { ConsistencyService, ofConsistencyMessage } from '../consistency';

/**
 * The core of the entire system. The workflow service is responsible for advancing existing workflow instances, creating
 * new workflows or launching new workflow instances across multiple counterparties.
 */
@Injectable()
export class WorkflowService implements OnModuleInit {

  constructor(private workflowRepo: WorkflowRepository,
              private optimizer: OptimizerService,
              private consistency: ConsistencyService) {
  }

  /** @inheritDoc */
  onModuleInit() {
    this.consistency.actions$
      .pipe(ofConsistencyMessage(createWorkflow))
      .subscribe((msg) => this.onCreateExternalWorkflow(msg.consistencyId, msg.workflow, msg.config));

    // If ANYONE sends a reject for this workflow, I want to remove it entirely
    this.consistency.actions$
      .pipe(ofConsistencyMessage(rejectWorkflow))
      .subscribe((msg) => this.onRejectExternalWorkflow(msg.consistencyId));

    this.consistency.actions$
      .pipe(ofConsistencyMessage(launchWorkflowInstance))
      .subscribe((msg) => this.onLaunchExternalWorkflowInstance(msg.workflowConsistencyId, msg.workflowInstanceConsistencyId));

    // If ANYONE sends a reject for this workflow instance, I want to remove it entirely
    this.consistency.actions$
      .pipe(ofConsistencyMessage(rejectWorkflowInstance))
      .subscribe((msg) => this.onRejectLaunchExternalWorkflow(msg.consistencyId));

    this.consistency.actions$
      .pipe(ofConsistencyMessage(advanceWorkflowInstance))
      .subscribe((msg) => this.onAdvanceExternalWorkflowInstance(msg.workflowInstanceConsistencyId, msg.fromState, msg.transitionEvent));

    // Rollback the state transition if ANYONE rejects it
    this.consistency.actions$
      .pipe(ofConsistencyMessage(rejectAdvanceWorkflowInstance))
      .subscribe((msg) => this.onRejectAdvanceExternalWorkflowInstance(msg.workflowInstanceConsistencyId, msg.fromState));
  }

  /**
   * Some counterparty wants to create a new workflow definition.
   * @param consistencyId
   * @param workflowModel
   * @param config
   * @private
   */
  private async onCreateExternalWorkflow(consistencyId: string, workflowModel: SupportedWorkflowModels, config?: SupportedWorkflowConfig) {
    await this.workflowRepo.insertWorkflow({ consistencyId, workflowModel, config });
    return this.consistency.dispatch(acceptWorkflow({ consistencyId }));
  }

  /**
   * Some counterparty rejected the proposed workflow definition.
   * @param consistencyId
   * @private
   */
  private async onRejectExternalWorkflow(consistencyId: string) {
    return this.workflowRepo.deleteWorkflowById(consistencyId);
  }

  /**
   * Some counterparty wants to launch a new workflow instance.
   * @param workflowId
   * @param consistencyId
   * @private
   */
  private async onLaunchExternalWorkflowInstance(workflowId: string, consistencyId: string) {
    await this.workflowRepo.insertWorkflowInstance({ workflowId, consistencyId });
    return this.consistency.dispatch(acceptWorkflowInstance({ consistencyId }));
  }

  /**
   * Some counterparty rejected the proposed workflow instance.
   * @param consistencyId
   * @private
   */
  private async onRejectLaunchExternalWorkflow(consistencyId: string) {
    return this.workflowRepo.deleteWorkflowInstanceById(consistencyId);
  }

  /**
   * Some counterparty wants to advance a certain workflow instance from one state to another.
   * @param instanceId
   * @param fromState
   * @param transitionEvent
   * @private
   */
  private async onAdvanceExternalWorkflowInstance(instanceId: string, fromState: StateValue, transitionEvent: string) {
    const workflowInstance = await this.workflowRepo.getWorkflowInstanceById(instanceId);
    if (workflowInstance == null) {
      return this.consistency.dispatch(rejectAdvanceWorkflowInstance({
        workflowInstanceConsistencyId: instanceId,
        fromState, transitionEvent,
        errorMessage: `Instance with ID "${instanceId}" does not exist`
      }));
    }

    const workflow = await this.workflowRepo.getWorkflowById(workflowInstance.workflowId);
    if (workflow == null) {
      return this.consistency.dispatch(rejectAdvanceWorkflowInstance({
        workflowInstanceConsistencyId: instanceId,
        fromState, transitionEvent,
        errorMessage: `Workflow with ID "${workflowInstance.workflowId}" does not exist`
      }));
    }

    const workflowStateMachine = createMachine(workflow.workflowModel);
    workflowInstance.currentState = workflowStateMachine.transition(fromState, transitionEvent) as any;
    await this.workflowRepo.updateWorkflowInstanceState(workflowInstance.consistencyId, { currentState: workflowInstance.currentState });
    return this.consistency.dispatch(acceptAdvanceWorkflowInstance({
      workflowInstanceConsistencyId: instanceId,
      newState: (workflowInstance.currentState as State<any>)?.value
    }));
  }

  private async onRejectAdvanceExternalWorkflowInstance(instanceId: string, fromState: StateValue) {
    const workflowInstance = await this.workflowRepo.getWorkflowInstanceById(instanceId);
    if (workflowInstance == null) {
      return;
    }
    workflowInstance.currentState = fromState;
  }

  async createWorkflow(workflow: SupportedWorkflowModels, config?: SupportedWorkflowConfig) {
    let workflowModel: MachineConfig<any, any, any>;
    const workflowModelType = config?.type ?? 'STATE_CHARTS';
    switch (workflowModelType) {
      case 'STATE_CHARTS':
        workflowModel = convertStateChartWorkflowConfig(workflow as StateChartWorkflow, config);
        break;
      default:
        throw new BadRequestException(`Workflow model type "${workflowModelType}" it not supported. Only raw state charts are supported right now.`);
    }

    workflowModel = this.optimizer.optimize(workflowModel, config?.optimizer);

    const entity = await this.workflowRepo.insertWorkflow({ config, workflowModel });
    await this.consistency.dispatch(createWorkflow({
      consistencyId: entity.consistencyId,
      workflow: entity.workflowModel,
      config: entity.config
    }));
    return entity;
  }

  async launchWorkflowInstance(workflowId: string, instanceConfig?: WorkflowInstanceConfig) {
    const workflow = await this.workflowRepo.getWorkflowById(workflowId);
    if (workflow == null) throw new NotFoundException(`Workflow with ID "${workflowId}" does not exist`);

    const entity = await this.workflowRepo.insertWorkflowInstance({
      workflowId,
      currentState: instanceConfig?.initialState
    });
    await this.consistency.dispatch(launchWorkflowInstance({
      workflowConsistencyId: workflow.consistencyId,
      workflowInstanceConsistencyId: entity.consistencyId
    }));
    return entity;
  }

  async advanceWorkflowInstance(workflowId: string, instanceId: string, transitionConfig: WorkflowInstanceTransitionConfig) {
    const workflow = await this.workflowRepo.getWorkflowById(workflowId);
    if (workflow == null) throw new NotFoundException(`Workflow with ID "${workflowId}" does not exist`);

    const workflowInstance = await this.workflowRepo.getWorkflowInstanceById(instanceId);
    if (workflowInstance == null) throw new NotFoundException(`Instance with ID "${instanceId}" does not exist for workflow "${workflowId}"`);

    const previousState = workflowInstance.currentState == null ? null : State.create(workflowInstance.currentState as any);
    const workflowStateMachine = createMachine(workflow.workflowModel);

    workflowInstance.currentState = workflowStateMachine.transition(previousState, transitionConfig.transition) as any;

    await this.consistency.dispatch(advanceWorkflowInstance({
      workflowInstanceConsistencyId: workflowInstance.consistencyId,
      fromState: (previousState as State<any>)?.value,
      transitionEvent: transitionConfig.transition
    }));
    return workflowInstance;
  }

  /**
   * Returns all currently available workflows.
   */
  getWorkflows() {
    return this.workflowRepo.getAllWorkflows();
  }

  /**
   * Returns the state of all currently active workflow instances.
   */
  getWorkflowInstances() {
    return this.workflowRepo.getAllWorkflowInstances();
  }

  /**
   * Returns the workflow with the given ID.
   * @param id Workflow ID.
   */
  getWorkflow(id: string) {
    const workflow = this.workflowRepo.getWorkflowById(id);
    if (workflow == null) throw new NotFoundException(`Workflow with ID "${id}" does not exist`);
    return Promise.resolve(workflow);
  }

  /**
   * Returns the workflow instance with the given ID.
   * @param workflowId Workflow ID.
   * @param instanceId Workflow instance ID.
   */
  getWorkflowInstance(workflowId: string, instanceId: string) {
    const workflow = this.workflowRepo.getWorkflowById(workflowId);
    if (workflow == null) throw new NotFoundException(`Workflow with ID "${workflowId}" does not exist`);
    const instance = this.workflowRepo.getWorkflowInstanceById(instanceId);
    if (instance == null) throw new NotFoundException(`Workflow instance with ID "${instanceId}" does not exist on workflow "${workflowId}"`);
    return Promise.resolve(instance);
  }
}
