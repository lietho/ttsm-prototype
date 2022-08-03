import { Injectable } from '@nestjs/common';
import { Workflow, WorkflowInstance } from './models';
import { randomUUIDv4 } from '../core/utils';
import { ConsistencyEntity } from '../consistency';

/**
 * It's important that all repository operations are idempotent.
 */
@Injectable()
export class WorkflowRepository {

  private workflows = new Map<string, Workflow>;
  private workflowInstances = new Map<string, WorkflowInstance>;

  updateOrInsertWorkflow(workflow: Omit<Workflow, 'consistencyId'> & Partial<ConsistencyEntity>): Workflow {
    if (workflow.consistencyId == null) {
      workflow.consistencyId = randomUUIDv4();
    }
    this.workflows.set(workflow.consistencyId, workflow as Workflow);
    return workflow as Workflow;
  }

  updateOrInsertWorkflowInstance(instance: Omit<WorkflowInstance, 'consistencyId'> & Partial<ConsistencyEntity>): WorkflowInstance {
    if (instance.consistencyId == null) {
      instance.consistencyId = randomUUIDv4();
    }
    this.workflowInstances.set(instance.consistencyId, instance as WorkflowInstance);
    return instance as WorkflowInstance;
  }

  deleteWorkflowById(id: string): boolean {
    return this.workflows.delete(id);
  }

  deleteWorkflowInstanceById(id: string): boolean {
    return this.workflowInstances.delete(id);
  }

  getWorkflowById(id: string): Workflow {
    return this.workflows.get(id);
  }

  getWorkflowInstanceById(id: string): WorkflowInstance {
    return this.workflowInstances.get(id);
  }

  getAllWorkflows(): Workflow[] {
    return Array.from(this.workflows.values());
  }

  getAllWorkflowInstances(): WorkflowInstance[] {
    return Array.from(this.workflowInstances.values());
  }
}
