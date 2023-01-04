import { Inject, Injectable } from "@nestjs/common";
import {
  Workflow,
  WorkflowInstance, WorkflowInstanceContext,
  WorkflowInstanceProposal,
  WorkflowInstanceTransition,
  WorkflowProposal
} from "../workflow";
import { PersistenceStrategy, StateTransition } from "./strategies";
import { PersistenceEvent } from "./utils";

/*
* Use this token as provider token to create an injectable instance for some persistence strategy.
*/
export const PERSISTENCE_STRATEGY_PROVIDER_TOKEN = "PERSISTENCE_STRATEGY";

/**
 * Adapter service for third party event sourcing services.
 */
@Injectable()
export class PersistenceService {

  constructor(@Inject(PERSISTENCE_STRATEGY_PROVIDER_TOKEN) private readonly persistenceStrategy: PersistenceStrategy) {}

  /**
   * Proposes a new workflow to all participants.
   * @param proposal
   */
  async proposeWorkflow(proposal: Omit<WorkflowProposal, "consistencyId" | "id">): Promise<Workflow> {
    return await this.persistenceStrategy.proposeWorkflow(proposal);
  }

  /**
   * Dispatches a workflow specification event.
   * @param id Workflow ID.
   * @param event Event to be dispatched.
   */
  async dispatchWorkflowEvent<T>(id: string, event: PersistenceEvent<T>): Promise<void> {
    return await this.persistenceStrategy.dispatchWorkflowEvent(id, event);
  }

  /**
   * Launches a new instances of a certain workflow.
   * @param proposal
   */
  async launchWorkflowInstance(proposal: Omit<WorkflowInstanceProposal, "consistencyId" | "id">): Promise<WorkflowInstance> {
    return await this.persistenceStrategy.launchWorkflowInstance(proposal);
  }

  /**
   * Dispatches a workflow instance event.
   * @param id Workflow instance ID.
   * @param event Event to be dispatched.
   */
  async dispatchInstanceEvent<T extends WorkflowInstanceContext>(id: string, event: PersistenceEvent<T>): Promise<void> {
    return await this.persistenceStrategy.dispatchInstanceEvent(id, event);
  }

  /**
   * Dispatches a workflow instance transition event.
   * @param id Workflow instance ID.
   * @param event Event to be dispatched.
   */
  async dispatchTransitionEvent<T extends WorkflowInstanceContext>(id: string, event: PersistenceEvent<T>): Promise<void> {
    return await this.persistenceStrategy.dispatchTransitionEvent(id, event);
  }

  /**
   * Advances the state of a specific workflow instance.
   * @param transition
   */
  async advanceWorkflowInstanceState(transition: WorkflowInstanceTransition): Promise<void> {
    return await this.persistenceStrategy.advanceWorkflowInstanceState(transition);
  }

  async getWorkflowStateAt(id: string, at: Date): Promise<Workflow | null> {
    return await this.persistenceStrategy.getWorkflowStateAt(id, at);
  }

  async getWorkflowInstanceStateAt(workflowId: string, id: string, at: Date): Promise<WorkflowInstance | null> {
    return await this.persistenceStrategy.getWorkflowInstanceStateAt(workflowId, id, at);
  }

  /**
   * Returns all payloads attached to state transitions until the given point in time.
   * @param workflowId Workflow ID.
   * @param id Workflow instance ID.
   * @param until Point in time until which should be search.
   */
  async getWorkflowInstanceStateTransitionPayloadsUntil(workflowId: string, id: string, until: Date): Promise<StateTransition[] | null> {
    return await this.persistenceStrategy.getWorkflowInstanceStateTransitionPayloadsUntil(workflowId, id, until);
  }

  /**
   * Returns the workflow with the given ID.
   * @param id Workflow ID.
   */
  async getWorkflowById(id: string): Promise<Workflow> {
    return await this.persistenceStrategy.getWorkflowById(id);
  }

  /**
   * Returns the workflow instance with the given ID.
   * @param id Workflow instance ID.
   */
  async getWorkflowInstanceById(workflowId: string, id: string): Promise<WorkflowInstance> {
    return await this.persistenceStrategy.getWorkflowInstanceById(workflowId, id);
  }

  /**
   * Returns all workflow instances of the given workflow.
   * @param workflowId Workflow ID.
   */
  async getWorkflowInstancesOfWorkflow(workflowId: string): Promise<WorkflowInstance[]> {
    return await this.persistenceStrategy.getWorkflowInstancesOfWorkflow(workflowId);
  }

  /**
   * Returns all workflow definitions created.
   */
  async getAllWorkflows(): Promise<Workflow[]> {
    return await this.persistenceStrategy.getAllWorkflows();
  }

  /**
   * Subscribes to ALL events emitted in the event store. This is a volatile subscription which means
   * that past events are ignored and only events are emitted that were dispatched after subscription.
   * @param eventHandler Event handler.
   */
  async subscribeToAll(eventHandler: (eventType: string, eventData: unknown) => void): Promise<void> {
    return await this.persistenceStrategy.subscribeToAll(eventHandler);
  }
}
