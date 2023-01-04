import { Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Subject, takeUntil } from "rxjs";
import { randomUUIDv4 } from "src/core/utils";
import * as eventTypes from "src/persistence/persistence.events";
import { OrbitDBEventLogManager } from "src/persistence/strategies/orbitdb/orbitdb-eventlog-manager";
import {
  Workflow,
  WorkflowInstance,
  WorkflowInstanceProposal,
  WorkflowInstanceTransition,
  WorkflowProposal
} from "src/workflow";
import {
  aggregateAllWorkflowEvents,
  aggregateWorkflowEvents,
  aggregateWorkflowInstanceEvents,
  PersistenceEvent
} from "../../utils";
import { PersistenceStrategy, StateTransition } from "../persistence-strategy";

export class OrbitDBStrategy implements PersistenceStrategy, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrbitDBStrategy.name);

  private dbManager: OrbitDBEventLogManager<PersistenceEvent<unknown>>;

  private readonly destroySubject = new Subject<void>();

  async onModuleInit() {
    this.dbManager = await OrbitDBEventLogManager.create();
    await this.createInitialDatabases();
  }

  async proposeWorkflow(proposal: Omit<WorkflowProposal, "consistencyId">): Promise<Workflow> {
    const proposedWorkflow: Workflow = {
      ...proposal,
      consistencyId: randomUUIDv4()
    };
    await this.appendToStream(this.getWorkflowsPath(), eventTypes.proposeWorkflow(proposedWorkflow));
    return proposedWorkflow as Workflow;
  }

  async dispatchWorkflowEvent<T>(id: string, event: PersistenceEvent<T>): Promise<void> {
    return await this.appendToStream(this.getWorkflowsPath(), event);
  }

  async launchWorkflowInstance(proposal: Omit<WorkflowInstanceProposal, "consistencyId">): Promise<WorkflowInstance> {
    const proposedWorkflowInstance: WorkflowInstance = {
      ...proposal,
      consistencyId: randomUUIDv4()
    };

    await this.appendToStream(this.getWorkflowInstancesPath(proposedWorkflowInstance.consistencyId), eventTypes.launchWorkflowInstance(proposedWorkflowInstance));
    return proposedWorkflowInstance as WorkflowInstance;
  }

  async dispatchInstanceEvent<T>(id: string, event: PersistenceEvent<T>): Promise<void> {
    // TODO id is the instanceId which is only needed by eventStore DB, we would need a generic way to retrieve the workflowId in instanceEvents
    // e.g., a WorkflowInstanceEvent interface
    return await this.appendToStream(this.getWorkflowInstancesPath(id), event);
  }

  async advanceWorkflowInstanceState(transition: WorkflowInstanceTransition): Promise<void> {
    await this.appendToStream(`instances.${transition.id}`, eventTypes.advanceWorkflowInstance(transition));
  }

  async getAllWorkflows(): Promise<Workflow[]> {
    return Object
      .entries(await this.getWorkflowsAggregate())
      .map(([, workflow]) => workflow);
  }

  async getWorkflowById(id: string): Promise<Workflow> {
    return (await this.getWorkflowsAggregate())[id];
  }

  async getWorkflowInstancesOfWorkflow(workflowId: string): Promise<WorkflowInstance[]> {
    return Object
      .entries(await this.getWorkflowInstancesAggregate())
      .filter(([, instance]) => instance.workflowId === workflowId)
      .map(([, instance]) => instance);
  }

  async getWorkflowInstanceById(id: string): Promise<WorkflowInstance> {
    return (await this.getWorkflowInstancesAggregate())[id];
  }

  async getWorkflowStateAt(id: string, at: Date): Promise<Workflow | null> {
    const eventStream = await this.readStream(`workflows.${id}`);
    try {
      const events = [];
      for await (const event of eventStream) {
        if (event.created > at.getTime()) {
          break;
        }
        events.push(event);
      }

      return aggregateWorkflowEvents(events);
    } catch (e) {
      return null;
    }
  }

  async getWorkflowInstanceStateAt(id: string, at: Date): Promise<WorkflowInstance | null> {
    const eventStream = await this.readStream(`instances.${id}`);
    try {
      const events = [];
      for await (const event of eventStream) {
        if (event.created > at.getTime()) {
          break;
        }
        events.push(event);
      }

      return aggregateWorkflowInstanceEvents(events);
    } catch (e) {
      return null;
    }
  }

  async getWorkflowInstanceStateTransitionPayloadsUntil(id: string, until: Date): Promise<StateTransition[] | null> {
    const result: StateTransition[] = [];
    const events = await this.readStream(`instances.${id}`);
    try {
      for await (const event of events) {
        if (event.created > until.getTime()) {
          break;
        }
        if (!eventTypes.advanceWorkflowInstance.sameAs(event.type)) {
          continue;
        }
        const stateMachineEvent = event.data as unknown as WorkflowInstanceTransition;
        result.push({
          event: stateMachineEvent.event,
          timestamp: new Date(event.created).toISOString(),
          payload: stateMachineEvent.payload
        });
      }
    } catch (e) {
      return null;
    }
    return result;
  }

  async subscribeToAll(eventHandler: (eventType: string, eventData: unknown) => void): Promise<void> {
    this.dbManager.all$
      .pipe(takeUntil(this.destroySubject))
      .subscribe(event => eventHandler(event.type, event.data));
  }

  async onModuleDestroy() {
    this.destroySubject.next();
    await this.dbManager.close();
  }

  private async createInitialDatabases() {
    // Create Workflow DB
    await this.dbManager.addConnection(this.getWorkflowsPath(), {
      type: 'eventlog',
      accessController: {
        write: [this.dbManager.identityId]
      }
    });

    // Create Workflow Instances DBs
    const workflowIds = await this.getWorkflowsAggregate().then(aggregate => Object.keys(aggregate));
    await Promise.all(workflowIds.map(workflowId => this.createWorkflowInstanceDatabase(workflowId)));
  }

  private async createWorkflowInstanceDatabase(workflowId: string) {
    await this.dbManager.addConnection(this.getWorkflowInstancesPath(workflowId), {
      type: 'eventlog',
      accessController: {
        write: [this.dbManager.identityId]
      }
    });
  }

  private getWorkflowsPath(): string {
    return `organization.${this.dbManager.identityId}.workflows`;
  }

  private getWorkflowInstancesPath(workflowId: string): string {
    return `organization.${this.dbManager.identityId}.workflows.${workflowId}.instances`;
  }

  /**
   * Returns the projected aggregate of all workflows.
   * @private
   */
  private async getWorkflowsAggregate(): Promise<Record<string, Workflow>> {
    const events = await this.readStream(this.getWorkflowsPath());
    return aggregateAllWorkflowEvents(events);
  }

  /**
   * Returns the projected aggregate of all workflow instances.
   * @private
   */
  private async getWorkflowInstancesAggregate(): Promise<Record<string, WorkflowInstance>> {
    return {};
  }

  /**
   * Appends a single event to the stream with the given name.
   * @param streamName Stream name.
   * @param event Event data.
   */
  private async appendToStream(streamName: string, event: PersistenceEvent<unknown>): Promise<void> {
    this.logger.debug(`Write to stream "${streamName}": ${JSON.stringify(event)}`);
    await this.dbManager.addEvent(streamName, event);
  }

  /**
   * Reads all events from the stream with the given name.
   * @param streamName Stream name.
   */
  private async readStream(streamName: string): Promise<PersistenceEvent<unknown>[]> {
    this.logger.debug(`Read all events from stream "${streamName}"`);

    return await this.dbManager.readStream(streamName);
  }

}