import { Inject, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { firstValueFrom, Subject, takeUntil } from "rxjs";
import { randomUUIDv4 } from "src/core/utils";
import * as eventTypes from "src/persistence/persistence.events";
import { OrbitDBEventLogManager } from "src/persistence/strategies/orbitdb/orbitdb-eventlog-manager";
import {
  Workflow,
  WorkflowContext,
  WorkflowInstance,
  WorkflowInstanceContext,
  WorkflowInstanceProposal,
  WorkflowInstanceTransition,
  WorkflowInstanceTransitionContext,
  WorkflowProposal
} from "src/workflow";
import {
  aggregateAllWorkflowEvents,
  aggregateAllWorkflowInstanceEvents,
  aggregateWorkflowInstanceIds,
  PersistenceEvent
} from "../../utils";
import { PersistenceStrategy, StateTransition } from "../persistence-strategy";

export class OrbitDBStrategy implements PersistenceStrategy, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrbitDBStrategy.name);

  private readonly destroySubject = new Subject<void>();

  constructor(@Inject(OrbitDBEventLogManager) private dbManager: OrbitDBEventLogManager<PersistenceEvent<unknown>>) {
  }

  async onModuleInit() {
    await firstValueFrom(this.dbManager.managerReady$);
    await this.createInitialDatabases();
  }

  async proposeWorkflow(proposal: Omit<WorkflowProposal, "consistencyId">): Promise<Workflow> {
    const consistencyId = randomUUIDv4();

    const proposedWorkflow: Workflow = {
      ...proposal,
      id: consistencyId,
      consistencyId
    };
    await this.createWorkflowInstanceDatabase(proposedWorkflow.consistencyId);
    await this.appendToStream(this.getWorkflowsPath(), eventTypes.proposeWorkflow(proposedWorkflow));
    return proposedWorkflow as Workflow;
  }

  async dispatchWorkflowEvent<T>(id: string, event: PersistenceEvent<T>): Promise<void> {
    return await this.appendToStream(this.getWorkflowsPath(), event);
  }

  async launchWorkflowInstance(proposal: Omit<WorkflowInstanceProposal, "consistencyId">): Promise<WorkflowInstance> {
    const consistencyId = randomUUIDv4();
    const proposedWorkflowInstance: WorkflowInstance = {
      ...proposal,
      id: consistencyId,
      consistencyId
    };

    await this.createWorkflowInstanceEventsDatabases(proposedWorkflowInstance.workflowId, proposedWorkflowInstance.consistencyId);
    await this.appendToStream(this.getWorkflowInstancesPath(proposedWorkflowInstance.workflowId), eventTypes.launchWorkflowInstance(proposedWorkflowInstance));
    return proposedWorkflowInstance as WorkflowInstance;
  }

  async dispatchInstanceEvent<T extends WorkflowInstanceContext>(id: string, event: PersistenceEvent<T>): Promise<void> {
    return await this.appendToStream(this.getWorkflowInstancesPath(event.data.workflowId), event);
  }

  async advanceWorkflowInstanceState(transition: WorkflowInstanceTransition): Promise<void> {
    if (transition.originatingExternalTransition != null) {
      await this.appendToStream(this.getWorkflowInstanceLocalEventsPath(transition.workflowId, transition.id), eventTypes.receivedTransition(transition));
    } else {
      await this.appendToStream(this.getWorkflowInstanceLocalEventsPath(transition.workflowId, transition.id), eventTypes.advanceWorkflowInstance(transition));
    }
  }

  async dispatchTransitionEvent<T extends WorkflowInstanceTransitionContext>(id: string, event: PersistenceEvent<T>): Promise<void> {
    return await this.appendToStream(this.getWorkflowInstanceLocalEventsPath(event.data.workflowId, id), event);
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
      .entries(await this.getWorkflowInstancesAggregate(event => event.data.id === workflowId, event => event.data.workflowId === workflowId))
      .filter(([, instance]) => instance.workflowId === workflowId)
      .map(([, instance]) => instance);
  }

  async getWorkflowInstanceById(workflowId: string, id: string): Promise<WorkflowInstance> {
    return (await this.getWorkflowInstancesAggregate(undefined, event => event.data.id === id))[id];
  }

  async getWorkflowStateAt(id: string, at: Date): Promise<Workflow | null> {
    return (await this.getWorkflowsAggregate(event =>
      event.data.id === id &&
      event.created <= at.getTime()
    ))[id];
  }

  async getWorkflowInstanceStateAt(workflowId: string, id: string, at: Date): Promise<WorkflowInstance | null> {
    return (await this.getWorkflowInstancesAggregate(
      event => event.data.id === workflowId,
      event => event.data.workflowId === workflowId && event.data.id === id && event.created <= at.getTime()
    ))[id];
  }

  async getWorkflowInstanceStateTransitionPayloadsUntil(workflowId: string, id: string, until: Date): Promise<StateTransition[] | null> {
    const result: StateTransition[] = [];
    const events = await this.readStream(this.getWorkflowInstanceLocalEventsPath(workflowId, id));
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
  }

  private async createInitialDatabases() {
    // Create Workflow DB
    this.logger.debug(`Connecting to "${this.getWorkflowsPath()}"`);
    await this.dbManager.addConnection(this.getWorkflowsPath(), {
      type: "eventlog",
      accessController: {
        write: [this.dbManager.identityId]
      }
    });

    // Create Workflow Instances DBs
    const workflowIds = await this.getWorkflowsAggregate().then(aggregate => Object.keys(aggregate));
    await Promise.all(workflowIds.map(workflowId => this.createWorkflowInstanceDatabase(workflowId)));

    type WorkflowId = string;
    type WorkflowInstanceId = string;
    const workflowInstanceIds: [WorkflowId, WorkflowInstanceId][] =
      await this.getWorkflowInstances()
        .then(instanceContexts => instanceContexts.map(({ workflowId, id }) => [workflowId, id]));
    await Promise.all(workflowInstanceIds.map(([workflowId, instanceId]) => this.createWorkflowInstanceEventsDatabases(workflowId, instanceId)));
  }

  private async createWorkflowInstanceDatabase(workflowId: string) {
    this.logger.debug(`Connecting to "${this.getWorkflowInstancesPath(workflowId)}"`);

    await this.dbManager.addConnection(this.getWorkflowInstancesPath(workflowId), {
      type: "eventlog",
      accessController: {
        write: [this.dbManager.identityId]
      }
    });
  }

  private async createWorkflowInstanceEventsDatabases(workflowId: string, instanceId: string) {
    this.logger.debug(`Connecting to "${this.getWorkflowInstanceLocalEventsPath(workflowId, instanceId)}"`);

    await this.dbManager.addConnection(this.getWorkflowInstanceLocalEventsPath(workflowId, instanceId), {
      type: "eventlog",
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

  private getWorkflowInstanceLocalEventsPath(workflowId: string, instanceId: string): string {
    return `organization.${this.dbManager.identityId}.workflows.${workflowId}.instances.${instanceId}.localEvents`;
  }

  /**
   * Returns the projected aggregate of all workflows.
   * @private
   */
  private async getWorkflowsAggregate<T extends WorkflowContext>(filter?: (event: PersistenceEvent<T>) => boolean): Promise<Record<string, Workflow>> {
    const events = await this.readStream(this.getWorkflowsPath());
    const filteredEvents = filter != null ? events.filter(filter) : events;
    return aggregateAllWorkflowEvents(filteredEvents);
  }

  private async getWorkflowInstances(): Promise<WorkflowInstanceContext[]> {
    const workflowIds = await this.getWorkflowsAggregate().then(aggregate => Object.keys(aggregate));
    const workflowInstanceEvents = (await Promise.all(
      workflowIds.map(workflowId => this.readStream(this.getWorkflowInstancesPath(workflowId)))
    )).flatMap(events => events);

    return aggregateWorkflowInstanceIds(workflowInstanceEvents);
  }


  /**
   * Returns the projected aggregate of all workflow instances.
   * @private
   */
  private async getWorkflowInstancesAggregate<T extends WorkflowInstanceContext>(
    workflowFilter?: (event: PersistenceEvent<T>) => boolean,
    filter?: (event: PersistenceEvent<T>) => boolean
  ): Promise<Record<string, WorkflowInstance>> {
    const workflowIds = await this.getWorkflowsAggregate(workflowFilter).then(aggregate => Object.keys(aggregate));
    const workflowInstanceEvents = (await Promise.all(
      workflowIds.map(workflowId => this.readStream(this.getWorkflowInstancesPath(workflowId)))
    )).flatMap(events => events);

    const filteredWorkflowInstanceEvents = filter != null ? workflowInstanceEvents.filter(filter) : workflowInstanceEvents;

    const workflowInstanceIds = aggregateWorkflowInstanceIds(filteredWorkflowInstanceEvents);
    const workflowInstanceLocalEvents = await Promise.all(
      workflowInstanceIds.map(({
                                 workflowId,
                                 id
                               }) => this.readStream(this.getWorkflowInstanceLocalEventsPath(workflowId, id)))
    ).then(events => events.flatMap(e => e));

    const filteredWorkflowInstanceLocalEvents = filter != null ? workflowInstanceLocalEvents.filter(filter) : workflowInstanceLocalEvents;

    return aggregateAllWorkflowInstanceEvents([...filteredWorkflowInstanceEvents, ...filteredWorkflowInstanceLocalEvents]);
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