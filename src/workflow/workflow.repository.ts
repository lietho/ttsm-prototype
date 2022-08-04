import { Injectable } from '@nestjs/common';
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
import { StreamNotFoundError } from '@eventstore/db-client';

/**
 * It's important that all repository operations are idempotent.
 */
@Injectable()
export class WorkflowRepository {

  constructor(private persistence: PersistenceService) {
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

  async deleteWorkflowById(id: string) {
    await this.persistence.appendToStream(`workflows.${id}`, { type: deleteWorkflowDefinitionEvent, data: { id } });
  }

  async deleteWorkflowInstanceById(id: string) {
    await this.persistence.appendToStream(`instances.${id}`, { type: deleteWorkflowInstanceEvent, data: { id } });
  }

  async getWorkflowById(id: string) {
    let result: (Workflow | null) = null;
    const events = await this.persistence.readStream(`workflows.${id}`);
    try {
      for await (const { event } of events) {
        if (event?.type === newWorkflowDefinitionEvent) {
          result = event.data as unknown as Workflow;
        }
        if (event?.type === deleteWorkflowDefinitionEvent) {
          result = null;
        }
      }
    } catch (e) {
      if (e instanceof StreamNotFoundError) {
        return null;
      }
    }
    return result;
  }

  async getWorkflowInstanceById(id: string) {
    let result: (WorkflowInstance | null) = null;
    const events = await this.persistence.readStream(`instances.${id}`);
    try {
      for await (const { event } of events) {
        if (event?.type === launchWorkflowEvent) {
          result = event.data as unknown as WorkflowInstance;
        }
        if (event?.type === updateWorkflowInstanceStateEvent && result != null) {
          result.currentState = (event.data as Pick<WorkflowInstance, 'currentState'>).currentState;
        }
        if (event?.type === deleteWorkflowDefinitionEvent) {
          result = null;
        }
      }
    } catch (e) {
      if (e instanceof StreamNotFoundError) {
        return null;
      }
    }
    return result;
  }

  /**
   * Returns all workflow definitions created.
   */
  async getAllWorkflows() {
    const result = new Map<string, Workflow>();
    const events = await this.persistence.readAll();
    for await (const { event } of events) {
      if (event?.type === newWorkflowDefinitionEvent) {
        const workflow = event.data as unknown as Workflow;
        result.set(workflow.consistencyId, workflow);
      }
      if (event?.type === deleteWorkflowDefinitionEvent) {
        result.delete((event.data as { id: string }).id);
      }
    }
    return Array.from(result.values());
  }

  /**
   * Returns all workflow instances launched.
   */
  async getAllWorkflowInstances() {
    const result = new Map<string, WorkflowInstance>();
    const events = await this.persistence.readAll();
    for await (const { event } of events) {
      if (event?.type === launchWorkflowEvent) {
        const instance = event.data as unknown as WorkflowInstance;
        result.set(instance.consistencyId, instance);
      }
      if (event?.type === updateWorkflowInstanceStateEvent) {
        const updateState = event.data as { id: string } & Pick<WorkflowInstance, 'currentState'>;
        result.get(updateState.id).currentState = updateState.currentState;
      }
      if (event?.type === deleteWorkflowInstanceEvent) {
        result.delete((event.data as { id: string }).id);
      }
    }
    return Array.from(result.values());
  }
}
