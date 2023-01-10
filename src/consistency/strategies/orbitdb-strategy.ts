import { HttpService } from "@nestjs/axios";
import { Inject, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { firstValueFrom, Subject, takeUntil } from "rxjs";
import { PersistenceService } from "src/persistence";
import { OrbitDBEventLogManager } from "src/persistence/strategies/orbitdb/orbitdb-eventlog-manager";
import {
  ExternalWorkflowInstanceTransition,
  WorkflowInstance,
  WorkflowInstanceProposal,
  WorkflowInstanceTransitionParticipantApproval,
  WorkflowInstanceTransitionParticipantDenial,
  WorkflowProposal
} from "src/workflow";
import { environment } from "../../environment";
import * as consistencyEvents from "../consistency.actions";
import { ConsistencyMessage } from "../models";
import { ConsistencyStrategy, Status } from "./consistency-strategy";

const ACCEPTED_EXTERNAL_CONSISTENCY_EVENTS = [
  consistencyEvents.advanceWorkflowInstance.type,
  consistencyEvents.acceptTransition.type,
  consistencyEvents.rejectTransition.type
]

export class OrbitDBStrategy implements ConsistencyStrategy, OnApplicationBootstrap {

  private readonly logger = new Logger(OrbitDBStrategy.name);
  readonly actions$ = new Subject<ConsistencyMessage<unknown>>();
  private readonly destroySubject = new Subject<void>();

  constructor(private http: HttpService,
              @Inject(OrbitDBEventLogManager) private dbManager: OrbitDBEventLogManager<ConsistencyMessage<unknown>>,
              private persistenceService: PersistenceService) {
  }

  async onApplicationBootstrap() {
    await firstValueFrom(this.dbManager.managerReady$);
    await this.createInitialDatabases();

    this.dbManager.all$
      .pipe(takeUntil(this.destroySubject))
      .subscribe(({event, originId}) => {
        // TODO: check authenticity of messages
        if (ACCEPTED_EXTERNAL_CONSISTENCY_EVENTS.includes(event.type)) {
          this.receiveConsistencyMessage(event);
        }
      });
  }

  receiveConsistencyMessage(msg: ConsistencyMessage<any>) {
    this.logger.debug(`Consistency message received: ${JSON.stringify(msg)}`);
    this.actions$.next(msg);
    return "OK";
  }

  /** @inheritDoc */
  async dispatch<T>(msg: ConsistencyMessage<T>): Promise<Status> {
    // create external events database connections on local events
    if (consistencyEvents.proposeWorkflow.sameAs(msg)) {
      return await this.createWorkflowExternalEventsDatabase((msg.payload as WorkflowProposal).id)
        .then(() => "OK", () => "NOK");
    }

    if (consistencyEvents.launchWorkflowInstance.sameAs(msg)) {
      const proposal = msg.payload as WorkflowInstanceProposal;
      return await this.createWorkflowInstanceExternalEventsDatabase(proposal.workflowId, proposal.id)
        .then(() => "OK", () => "NOK");
    }

    // send to external participant
    if (consistencyEvents.advanceWorkflowInstance.sameAs(msg)) {
      const transition = msg.payload as ExternalWorkflowInstanceTransition;
      return await this.sendWorkflowToExternalParticipants(transition)
        .then(() => "OK", () => "NOK");
    }

    // send response to originating participant
    if (consistencyEvents.rejectTransition.sameAs(msg)) {
      const denial = msg.payload as WorkflowInstanceTransitionParticipantDenial;
      const origin = denial.transition.originatingParticipant;
      return await this.sendMessageToExternalWorkflowInstance(msg, origin.organizationId, origin.workflowId, origin.workflowInstanceId)
        .then(() => "OK", () => "NOK");
    }

    if (consistencyEvents.acceptTransition.sameAs(msg)) {
      const approval = msg.payload as WorkflowInstanceTransitionParticipantApproval;
      const origin = approval.transition.originatingParticipant;
      return await this.sendMessageToExternalWorkflowInstance(msg, origin.organizationId, origin.workflowId, origin.workflowInstanceId)
        .then(() => "OK", () => "NOK");
    }

    this.logger.debug(`Dispatching new message: ${JSON.stringify(msg)}`);

    return "OK";
  }

  /** @inheritDoc */
  async getStatus(): Promise<Status> {
    return Promise.all(environment.consistency.p2p.peerUrls
      .map(async (url) => await firstValueFrom(this.http.get(url + "/ping")))
    ).then(() => "OK", () => "NOK");
  }

  getOrganizationIdentifier(): string {
    return this.dbManager.identityId;
  }

  private async sendWorkflowToExternalParticipants(transition: ExternalWorkflowInstanceTransition) {
    try {
      const externalEventsDBName = transition.instanceId != null
        ? await this.connectToWorkflowInstanceExternalEventsDatabase(transition.organizationId, transition.workflowId, transition.instanceId)
        : await this.connectToWorkflowExternalEventsDatabase(transition.organizationId, transition.workflowId);

      await this.dbManager.addEvent(externalEventsDBName, consistencyEvents.advanceWorkflowInstance(transition), false);

      this.dbManager.removeConnectionAfterTimeout(
        externalEventsDBName,
        environment.consistency.orbitDB.CONNECTION_KEEPALIVE_GRACE_PERIOD ?? 30000
      );

    } catch (ex: unknown) {
      if (ex instanceof Error) {
        this.receiveConsistencyMessage(consistencyEvents.rejectTransition({
          workflowId: transition.workflowId,
          id: transition.instanceId,
          reasons: [ex.message],
          transition: transition
        }));
      }

      throw ex;
    }
  }

  private async sendMessageToExternalWorkflowInstance<T>(message: ConsistencyMessage<T>, organizationId: string, workflowId: string, workflowInstanceId: string) {
    const externalEventsDBName = await this.connectToWorkflowInstanceExternalEventsDatabase(organizationId, workflowId, workflowInstanceId);
    await this.dbManager.addEvent(externalEventsDBName, message, false);
    this.dbManager.removeConnectionAfterTimeout(
      externalEventsDBName,
      environment.consistency.orbitDB.CONNECTION_KEEPALIVE_GRACE_PERIOD ?? 30000
    );
  }

  private async createInitialDatabases() {
    const workflows = await this.persistenceService.getAllWorkflows();

    await Promise.all(workflows.map(wfl => this.createWorkflowExternalEventsDatabase(wfl.id)));
    const workflowInstances = (await Promise.all(
        workflows.map(wfl => this.persistenceService.getWorkflowInstancesOfWorkflow(wfl.id)))
    ).flatMap(instances => instances as WorkflowInstance[]);

    await Promise.all(workflowInstances.map(wfli => this.createWorkflowInstanceExternalEventsDatabase(wfli.workflowId, wfli.id)));
  }

  private async createWorkflowExternalEventsDatabase(workflowId: string) {
    this.logger.debug(`Connecting to "${this.getWorkflowExternalEventsPath(workflowId)}"`);

    await this.dbManager.addConnection(this.getWorkflowExternalEventsPath(workflowId), {
      type: "eventlog",
      accessController: {
        write: ["*"]
      }
    });
  }

  private async createWorkflowInstanceExternalEventsDatabase(workflowId: string, instanceId: string) {
    this.logger.debug(`Connecting to "${this.getWorkflowInstanceExternalEventsPath(workflowId, instanceId)}"`);

    await this.dbManager.addConnection(this.getWorkflowInstanceExternalEventsPath(workflowId, instanceId), {
      type: "eventlog",
      accessController: {
        write: ["*"]
      }
    });
  }

  private async connectToWorkflowExternalEventsDatabase(organizationId: string, workflowId: string): Promise<string> {
    const dbName = this.getWorkflowExternalEventsPath(workflowId, organizationId);
    this.logger.debug(`Connecting to "${dbName}"`);

    if (this.dbManager.hasConnection(dbName)) {
      this.dbManager.stopCloseTimeout(dbName);
      return dbName;
    }

    return await this.dbManager.addConnection(dbName, {
      type: "eventlog",
      accessController: {
        write: ["*"]
      }
    }).then(() => dbName);
  }

  private async connectToWorkflowInstanceExternalEventsDatabase(organizationId: string, workflowId: string, instanceId: string): Promise<string> {
    const dbName = this.getWorkflowInstanceExternalEventsPath(workflowId, instanceId, organizationId);
    this.logger.debug(`Connecting to "${dbName}"`);

    if (this.dbManager.hasConnection(dbName)) {
      this.dbManager.stopCloseTimeout(dbName);
      return dbName;
    }

    return await this.dbManager.addConnection(dbName, {
      type: "eventlog",
      accessController: {
        write: ["*"]
      }
    }).then(() => dbName);
  }

  private getWorkflowExternalEventsPath(workflowId: string, organizationId: string = this.dbManager.identityId) {
    return `organization.${organizationId}.workflows.${workflowId}.externalEvents`;
  }

  private getWorkflowInstanceExternalEventsPath(workflowId: string, instanceId: string, organizationId: string = this.dbManager.identityId) {
    return `organization.${organizationId}.workflows.${workflowId}.instances.${instanceId}.externalEvents`;
  }
}