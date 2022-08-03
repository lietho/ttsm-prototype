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

    this.consistency.actions$
      .pipe(ofConsistencyMessage(rejectAdvanceWorkflowInstance))
      .subscribe((msg) => this.onRejectAdvanceExternalWorkflowInstance(msg.workflowInstanceConsistencyId, msg.fromState));
  }

  private onCreateExternalWorkflow(consistencyId: string, workflowModel: SupportedWorkflowModels, config?: SupportedWorkflowConfig): void {
    this.workflowRepo.updateOrInsertWorkflow({ consistencyId, workflowModel, config });
    this.consistency.dispatch(acceptWorkflow({ consistencyId }));
  }

  private onRejectExternalWorkflow(consistencyId: string): void {
    this.workflowRepo.deleteWorkflowById(consistencyId);
  }

  private onLaunchExternalWorkflowInstance(workflowId: string, consistencyId: string): void {
    this.workflowRepo.updateOrInsertWorkflowInstance({ workflowId, consistencyId });
    this.consistency.dispatch(acceptWorkflowInstance({ consistencyId }));
  }

  private onRejectLaunchExternalWorkflow(consistencyId: string): void {
    this.workflowRepo.deleteWorkflowInstanceById(consistencyId);
  }

  private onAdvanceExternalWorkflowInstance(instanceId: string, fromState: StateValue, transitionEvent: string): void {
    const workflowInstance = this.workflowRepo.getWorkflowInstanceById(instanceId);
    if (workflowInstance == null) {
      this.consistency.dispatch(rejectAdvanceWorkflowInstance({
        workflowInstanceConsistencyId: instanceId,
        fromState, transitionEvent,
        err: `Instance with ID "${instanceId}" does not exist`
      }));
      return;
    }

    const workflow = this.workflowRepo.getWorkflowById(workflowInstance.workflowId);
    if (workflow == null) {
      this.consistency.dispatch(rejectAdvanceWorkflowInstance({
        workflowInstanceConsistencyId: instanceId,
        fromState, transitionEvent,
        err: `Workflow with ID "${workflowInstance.workflowId}" does not exist`
      }));
      return;
    }

    const workflowStateMachine = createMachine(workflow.workflowModel);
    workflowInstance.currentState = workflowStateMachine.transition(fromState, transitionEvent) as any;
    this.consistency.dispatch(acceptAdvanceWorkflowInstance({
      workflowInstanceConsistencyId: instanceId,
      fromState, transitionEvent
    }));
  }

  private onRejectAdvanceExternalWorkflowInstance(instanceId: string, fromState: StateValue): void {
    const workflowInstance = this.workflowRepo.getWorkflowInstanceById(instanceId);
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

    const entity = this.workflowRepo.updateOrInsertWorkflow({ config, workflowModel });
    await this.consistency.dispatch(createWorkflow({
      consistencyId: entity.consistencyId,
      workflow: entity.workflowModel,
      config: entity.config
    }));
    return entity;
  }

  async launchWorkflowInstance(workflowId: string, instanceConfig?: WorkflowInstanceConfig) {
    const workflow = this.workflowRepo.getWorkflowById(workflowId);
    if (workflow == null) {
      throw new NotFoundException(`Workflow with ID "${workflowId}" does not exist`);
    }
    const entity = this.workflowRepo.updateOrInsertWorkflowInstance({
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
    const workflow = this.workflowRepo.getWorkflowById(workflowId);
    if (workflow == null) {
      throw new NotFoundException(`Workflow with ID "${workflowId}" does not exist`);
    }
    const workflowInstance = this.workflowRepo.getWorkflowInstanceById(instanceId);
    if (workflowInstance == null) {
      throw new NotFoundException(`Instance with ID "${instanceId}" does not exist for workflow "${workflowId}"`);
    }

    const previousState = workflowInstance.currentState;
    const workflowStateMachine = createMachine(workflow.workflowModel);
    workflowInstance.currentState = workflowStateMachine.transition(workflowInstance.currentState as any, transitionConfig.transition) as any;

    await this.consistency.dispatch(advanceWorkflowInstance({
      workflowInstanceConsistencyId: workflowInstance.consistencyId,
      fromState: (previousState as State<any>)?.value,
      transitionEvent: transitionConfig.transition
    }));
    return workflowInstance;
  }

  getWorkflows() {
    return Promise.resolve(this.workflowRepo.getAllWorkflows());
  }
}
