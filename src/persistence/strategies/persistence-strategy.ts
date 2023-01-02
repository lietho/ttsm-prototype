import { PersistenceEvent } from "../utils";
import {
  Workflow,
  WorkflowInstance,
  WorkflowInstanceProposal,
  WorkflowInstanceTransition,
  WorkflowProposal
} from "src/workflow";

export type StateTransition = { event: string, timestamp: string, payload: any };

export interface PersistenceStrategy {
  /**
   * Proposes a new workflow to all participants.
   * @param proposal
   */
  proposeWorkflow(proposal: Omit<WorkflowProposal, "consistencyId">): Promise<Workflow>;

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
  launchWorkflowInstance(proposal: Omit<WorkflowInstanceProposal, "consistencyId">): Promise<WorkflowInstance>;

  /**
   * Dispatches a workflow instance event.
   * @param id Workflow instance ID.
   * @param event Event to be dispatched.
   */
  dispatchInstanceEvent<T>(id: string, event: PersistenceEvent<T>): Promise<void>;

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
   * @param id Workflow instance ID.
   */
  getWorkflowInstanceById(id: string): Promise<WorkflowInstance>;

  getWorkflowStateAt(id: string, at: Date): Promise<Workflow | null>;

  getWorkflowInstanceStateAt(id: string, at: Date): Promise<WorkflowInstance | null>;

  /**
   * Returns all payloads attached to state transitions until the given point in time.
   * @param id Workflow instance ID.
   * @param until Point in time until which should be search.
   */
  getWorkflowInstanceStateTransitionPayloadsUntil(id: string, until: Date): Promise<StateTransition[] | null>;

  /**
   * Subscribes to ALL events emitted in the event store. This is a volatile subscription which means
   * that past events are ignored and only events are emitted that were dispatched after subscription.
   * @param eventHandler Event handler.
   */
  subscribeToAll(eventHandler: (eventType: string, eventData: unknown) => void): Promise<void>;
}