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
      .subscribe(({ commitmentReference, payload }) => this.onCreateExternalWorkflow(
        payload.consistencyId,
        payload.workflow,
        payload.config,
        commitmentReference
      ));

    // If ANYONE sends a reject for this workflow, I want to remove it entirely
    this.consistency.actions$
      .pipe(ofConsistencyMessage(rejectWorkflow))
      .subscribe(({ commitmentReference, payload }) => this.onRejectExternalWorkflow(
        payload.consistencyId,
        commitmentReference
      ));

    this.consistency.actions$
      .pipe(ofConsistencyMessage(launchWorkflowInstance))
      .subscribe(({ commitmentReference, payload }) => this.onLaunchExternalWorkflowInstance(
        payload.workflowConsistencyId,
        payload.workflowInstanceConsistencyId,
        commitmentReference
      ));

    // If ANYONE sends a reject for this workflow instance, I want to remove it entirely
    this.consistency.actions$
      .pipe(ofConsistencyMessage(rejectWorkflowInstance))
      .subscribe(({ commitmentReference, payload }) => this.onRejectLaunchExternalWorkflow(
        payload.consistencyId,
        commitmentReference
      ));

    this.consistency.actions$
      .pipe(ofConsistencyMessage(advanceWorkflowInstance))
      .subscribe(({ commitmentReference, payload }) => this.onAdvanceExternalWorkflowInstance(
        payload.workflowInstanceConsistencyId,
        payload.fromState,
        payload.transitionEvent,
        commitmentReference
      ));

    // Rollback the state transition if ANYONE rejects it
    this.consistency.actions$
      .pipe(ofConsistencyMessage(rejectAdvanceWorkflowInstance))
      .subscribe(({ commitmentReference, payload }) => this.onRejectAdvanceExternalWorkflowInstance(
        payload.workflowInstanceConsistencyId,
        payload.fromState,
        commitmentReference
      ));
  }

  /**
   * Some counterparty wants to create a new workflow definition.
   * @param consistencyId
   * @param workflowModel
   * @param config
   * @param commitmentReference
   * @private
   */
  private async onCreateExternalWorkflow(consistencyId: string, workflowModel: SupportedWorkflowModels, config: SupportedWorkflowConfig, commitmentReference: string) {
    await this.workflowRepo.insertWorkflow({ consistencyId, workflowModel, config, commitmentReference });
    return this.consistency.dispatch(acceptWorkflow({ consistencyId }));
  }

  /**
   * Some counterparty rejected the proposed workflow definition.
   * @param consistencyId
   * @param commitmentReference
   * @private
   */
  private async onRejectExternalWorkflow(consistencyId: string, commitmentReference: string) {
    return this.workflowRepo.deleteWorkflowById(consistencyId, commitmentReference);
  }

  /**
   * Some counterparty wants to launch a new workflow instance.
   * @param workflowId
   * @param consistencyId
   * @param commitmentReference
   * @private
   */
  private async onLaunchExternalWorkflowInstance(workflowId: string, consistencyId: string, commitmentReference: string) {
    await this.workflowRepo.insertWorkflowInstance({ workflowId, consistencyId, commitmentReference });
    return this.consistency.dispatch(acceptWorkflowInstance({ consistencyId }));
  }

  /**
   * Some counterparty rejected the proposed workflow instance.
   * @param consistencyId
   * @param commitmentReference
   * @private
   */
  private async onRejectLaunchExternalWorkflow(consistencyId: string, commitmentReference: string) {
    return this.workflowRepo.deleteWorkflowInstanceById(consistencyId, commitmentReference);
  }

  /**
   * Some counterparty wants to advance a certain workflow instance from one state to another.
   * @param instanceId
   * @param fromState
   * @param transitionEvent
   * @param commitmentReference
   * @private
   */
  private async onAdvanceExternalWorkflowInstance(instanceId: string, fromState: StateValue, transitionEvent: string, commitmentReference: string) {
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

  private async onRejectAdvanceExternalWorkflowInstance(instanceId: string, fromState: StateValue, commitmentReference: string) {
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

  async getWorkflowStateAt(id: string, at: Date) {
    const state = await this.workflowRepo.getWorkflowStateAt(id, at);
    if (state == null) throw new NotFoundException(`Workflow "${id}" did not exist at ${at.toISOString()}`);
    return state;
  }

  async getWorkflowInstanceStateAt(id: string, at: Date) {
    const state = await this.workflowRepo.getWorkflowInstanceStateAt(id, at);
    if (state == null) throw new NotFoundException(`Workflow instance "${id}" did not exist at ${at.toISOString()}`);
    return state;
  }

  /**
   * Returns all currently available workflows.
   */
  async getWorkflows() {
    return await this.workflowRepo.getAllWorkflows();
  }

  /**
   * Returns the state of all currently active workflow instances.
   */
  async getWorkflowInstances() {
    return await this.workflowRepo.getAllWorkflowInstances();
  }

  /**
   * Returns the workflow with the given ID.
   * @param id Workflow ID.
   */
  async getWorkflow(id: string) {
    const workflow = await this.workflowRepo.getWorkflowById(id);
    if (workflow == null) throw new NotFoundException(`Workflow with ID "${id}" does not exist`);
    return workflow;
  }

  /**
   * Returns the workflow instance with the given ID.
   * @param workflowId Workflow ID.
   * @param instanceId Workflow instance ID.
   */
  async getWorkflowInstance(workflowId: string, instanceId: string) {
    const workflow = await this.workflowRepo.getWorkflowById(workflowId);
    if (workflow == null) throw new NotFoundException(`Workflow with ID "${workflowId}" does not exist`);
    const instance = await this.workflowRepo.getWorkflowInstanceById(instanceId);
    if (instance == null) throw new NotFoundException(`Workflow instance with ID "${instanceId}" does not exist on workflow "${workflowId}"`);
    return instance;
  }

  /**
   * Returns all workflow instances of the workflow with the given ID.
   * @param workflowId Workflow ID.
   */
  async getWorkflowInstancesOfWorkflow(workflowId: string) {
    return await this.workflowRepo.getWorkflowInstancesOfWorkflow(workflowId);
  }
}
