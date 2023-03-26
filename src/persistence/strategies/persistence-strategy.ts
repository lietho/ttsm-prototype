import {
  Workflow,
  WorkflowInstance,
  WorkflowInstanceContext,
  WorkflowInstanceProposal,
  WorkflowInstanceTransition,
  WorkflowInstanceTransitionContext,
  WorkflowProposal
} from "src/workflow";
import { PersistenceEvent } from "../utils";

export type StateTransition = { event: string, timestamp: string, payload: any };

export interface PersistenceStrategy {
  /**
   * Proposes a new workflow to all participants.
   * @param proposal
   */
  proposeWorkflow(proposal: Omit<WorkflowProposal, "organizationId" | "consistencyId" | "id">): Promise<Workflow>;

  /**
   * Dispatches a workflow specification event.
   * @param id Workflow ID.
   * @param event Event to be dispatched.
   */
  dispatchWorkflowEvent<T>(id: string, event: PersistenceEvent<T>): Promise<void>;

  /**
   * Launches a new instances of a certain workflow.
   * @param proposal
   */
  launchWorkflowInstance(proposal: Omit<WorkflowInstanceProposal, "consistencyId" | "id">): Promise<WorkflowInstance>;

  /**
   * Dispatches a workflow instance event.
   * @param id Workflow instance ID.
   * @param event Event to be dispatched.
   */
  dispatchInstanceEvent<T extends WorkflowInstanceContext>(id: string, event: PersistenceEvent<T>): Promise<void>;

  /**
   * Dispatches a workflow instance transition event.
   * @param id Workflow instance ID.
   * @param event Event to be dispatched.
   */
  dispatchTransitionEvent<T extends WorkflowInstanceTransitionContext>(id: string, event: PersistenceEvent<T>): Promise<void>;

  /**
   * Advances the state of a specific workflow instance.
   * @param transition
   */
  advanceWorkflowInstanceState(transition: WorkflowInstanceTransition): Promise<void>;

  /**
   * Returns all workflow definitions created.
   */
  getAllWorkflows(): Promise<Workflow[]>;

  /**
   * Returns the workflow with the given ID.
   * @param id Workflow ID.
   */
  getWorkflowById(id: string): Promise<Workflow>;

  /**
   * Returns all workflow instances of the given workflow.
   * @param workflowId Workflow ID.
   */
  getWorkflowInstancesOfWorkflow(workflowId: string): Promise<WorkflowInstance[]>;

  /**
   * Returns the workflow instance with the given ID.
   * @param workflowId Workflow ID.
   * @param id Workflow instance ID.
   */
  getWorkflowInstanceById(workflowId: string, id: string): Promise<WorkflowInstance>;

  getWorkflowStateAt(id: string, at: Date): Promise<Workflow | null>;

  getWorkflowInstanceStateAt(workflowId: string, id: string, at: Date): Promise<WorkflowInstance | null>;

  /**
   * Returns all payloads attached to state transitions until the given point in time.
   * @param workflowId Workflow ID.
   * @param id Workflow instance ID.
   * @param until Point in time until which should be search.
   */
  getWorkflowInstanceStateTransitionPayloadsUntil(workflowId: string, id: string, until: Date): Promise<StateTransition[] | null>;

  /**
   * Subscribes to ALL events emitted in the event store. This is a volatile subscription which means
   * that past events are ignored and only events are emitted that were dispatched after subscription.
   * @param eventHandler Event handler.
   */
  subscribeToAll(eventHandler: (eventType: string, eventData: unknown) => void): Promise<void>;
}