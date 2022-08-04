import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Workflow, WorkflowInstance } from './models';
import { randomUUIDv4 } from '../core/utils';
import { ConsistencyEntity } from '../consistency';
import { PersistenceService } from '../persistence';
import {
  deleteWorkflowDefinitionEvent,
  deleteWorkflowInstanceEvent,
  launchWorkflowEvent,
  newWorkflowDefinitionEvent,
  updateWorkflowInstanceStateEvent
} from './workflow.events';

/**
 * It's important that all repository operations are idempotent.
 */
@Injectable()
export class WorkflowRepository implements OnModuleInit, OnModuleDestroy {

  private readonly workflowsProjectionName = 'custom-projections.workflows.' + randomUUIDv4();
  private readonly workflowsProjection = `
    fromAll()
        .when({
            $init: () => ({ workflows: {} }),
            ${newWorkflowDefinitionEvent}: (s, e) => { s.workflows[e.data.consistencyId] = e.data; }
            ${deleteWorkflowDefinitionEvent}: (s, e) => { delete s.workflows[e.data.id]; }
        })
        .transformBy((state) => state.workflows)
        .outputState();
  `;

  private readonly workflowInstancesProjectionName = 'custom-projections.instances.' + randomUUIDv4();
  private readonly workflowInstancesProjection = `
    fromAll()
        .when({
            $init: () => ({ instances: {} }),
            ${launchWorkflowEvent}: (s, e) => { s.instances[e.data.consistencyId] = e.data; }
            ${updateWorkflowInstanceStateEvent}: (s, e) => { s.instances[e.data.id].currentState = e.data.currentState; }
            ${deleteWorkflowInstanceEvent}: (s, e) => { delete s.instances[e.data.id]; }
        })
        .transformBy((state) => state.instances)
        .outputState();
  `;

  constructor(private persistence: PersistenceService) {
  }

  /** @inheritDoc */
  async onModuleInit() {
    await this.persistence.createProjection(this.workflowsProjectionName, this.workflowsProjection);
    await this.persistence.createProjection(this.workflowInstancesProjectionName, this.workflowInstancesProjection);
  }

  async onModuleDestroy() {
    await this.persistence.disableProjection(this.workflowsProjectionName);
    await this.persistence.deleteProjection(this.workflowsProjectionName);

    await this.persistence.disableProjection(this.workflowInstancesProjectionName);
    await this.persistence.deleteProjection(this.workflowInstancesProjectionName);
  }

  async insertWorkflow(workflow: Omit<Workflow, 'consistencyId'> & Partial<ConsistencyEntity>) {
    if (workflow.consistencyId == null) {
      workflow.consistencyId = randomUUIDv4();
    }
    await this.persistence.appendToStream(`workflows.${workflow.consistencyId}`, {
      type: newWorkflowDefinitionEvent,
      data: workflow
    });
    return workflow as Workflow;
  }

  async insertWorkflowInstance(instance: Omit<WorkflowInstance, 'consistencyId'> & Partial<ConsistencyEntity>) {
    if (instance.consistencyId == null) {
      instance.consistencyId = randomUUIDv4();
    }
    await this.persistence.appendToStream(`instances.${instance.consistencyId}`, {
      type: launchWorkflowEvent,
      data: instance
    });
    return instance as WorkflowInstance;
  }

  async updateWorkflowInstanceState(id: string, newState: Pick<WorkflowInstance, 'currentState'>) {
    await this.persistence.appendToStream(`instances.${id}`, {
      type: updateWorkflowInstanceStateEvent,
      data: { id, ...newState }
    });
  }

  async getWorkflowStateAt(id: string, at: Date) {
    let result: Workflow = null;
    const events = await this.persistence.readStream(`workflows.${id}`);
    try {
      for await (const { event } of events) {
        const timestamp = new Date(event.created / 10000);
        if (timestamp.getTime() > at.getTime()) {
          break;
        }
        switch (event?.type) {
          case newWorkflowDefinitionEvent:
            result = event.data as unknown as Workflow;
            break;
          case deleteWorkflowDefinitionEvent:
            result = null;
            break;
        }
      }
    } catch (e) {
      return null;
    }
    return result;
  }

  async getWorkflowInstanceStateAt(id: string, at: Date) {
    let result: WorkflowInstance = null;
    const events = await this.persistence.readStream(`instances.${id}`);
    try {
      for await (const { event } of events) {
        const timestamp = new Date(event.created / 10000);
        if (timestamp.getTime() > at.getTime()) {
          break;
        }
        switch (event?.type) {
          case launchWorkflowEvent:
            result = event.data as unknown as WorkflowInstance;
            break;
          case updateWorkflowInstanceStateEvent:
            result.currentState = (event.data as unknown as Pick<WorkflowInstance, 'currentState'>).currentState;
            break;
          case deleteWorkflowInstanceEvent:
            result = null;
            break;
        }
      }
    } catch (e) {
      return null;
    }
    return result;
  }

  async deleteWorkflowById(id: string, commitmentReference: string) {
    await this.persistence.appendToStream(`workflows.${id}`, {
      type: deleteWorkflowDefinitionEvent,
      data: { id, commitmentReference }
    });
  }

  async deleteWorkflowInstanceById(id: string, commitmentReference: string) {
    await this.persistence.appendToStream(`instances.${id}`, {
      type: deleteWorkflowInstanceEvent,
      data: { id, commitmentReference }
    });
  }

  async getWorkflowById(id: string) {
    return (await this.getWorkflowsAggregate())[id];
  }

  async getWorkflowInstanceById(id: string) {
    return (await this.getWorkflowInstancesAggregate())[id];
  }

  /**
   * Returns all workflow instances of the given workflow.
   * @param workflowId Workflow ID.
   */
  async getWorkflowInstancesOfWorkflow(workflowId: string) {
    return Object
      .entries(await this.getWorkflowInstancesAggregate())
      .filter(([, instance]) => instance.workflowId === workflowId)
      .map(([, instance]) => instance);
  }

  /**
   * Returns all workflow definitions created.
   */
  async getAllWorkflows() {
    return Object
      .entries(await this.getWorkflowsAggregate())
      .map(([, workflow]) => workflow);
  }

  /**
   * Returns all workflow instances launched.
   */
  async getAllWorkflowInstances() {
    return Object
      .entries(await this.getWorkflowInstancesAggregate())
      .map(([, instance]) => instance);
  }

  /**
   * Returns the projected aggregate of all workflows.
   * @private
   */
  private async getWorkflowsAggregate() {
    return await this.persistence.getProjectionResult<Record<string, Workflow>>(this.workflowsProjectionName) ?? {};
  }

  /**
   * Returns the projected aggregate of all workflow instances.
   * @private
   */
  private async getWorkflowInstancesAggregate() {
    return await this.persistence.getProjectionResult<Record<string, WorkflowInstance>>(this.workflowInstancesProjectionName) ?? {};
  }
}
