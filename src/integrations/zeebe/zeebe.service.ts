import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { MachineConfig } from 'xstate';
import { ZBClient } from 'zeebe-node';
import { WorkflowInstanceProposal, WorkflowInstanceTransition, WorkflowProposal, WorkflowService } from '../../workflow';
import { zeebeCreatedProcessInstance, zeebeDeployedProcess, ZeebeProcessMetadata } from './zeebe.events';
import { PersistenceService } from '../../persistence';
import * as persistenceEvents from '../../persistence/persistence.events';
import { randomUUIDv4 } from '../../core/utils';
import { environment } from '../../environment';

@Injectable()
export class ZeebeService implements OnModuleInit, OnModuleDestroy {

  private readonly logger = new Logger(ZeebeService.name);

  private readonly zeebeProjectionName = 'custom-projections.zeebe.' + randomUUIDv4();
  private readonly zeebeProjection = `
    fromAll()
        .when({
            $init: () => ({ processes: {} }),
            "${zeebeDeployedProcess.type}": (s, e) => {
              s.processes[e.data.definition.consistencyId] = {
                key: e.data.key,
                definition: e.data.definition,
                processes: e.data.processes,
                instances: []
              };
            },
            "${zeebeCreatedProcessInstance.type}": (s, e) => {
              s.processes[e.data.definition.workflowId] = {
                ...s.processes[e.data.definition.workflowId],
                instances: [
                  ...s.processes[e.data.definition.workflowId].instances,
                  {
                    ...e.data.instance,
                    definition: e.data.definition
                  }
                ]
              };
            }
        })
        .transformBy((state) => state.processes)
        .outputState();
  `;

  private zeebeClient!: ZBClient;

  constructor(private persistence: PersistenceService,
              private workflow: WorkflowService) {
  }

  /** @inheritDoc */
  async onModuleInit() {
    if (environment.integrations.zeebe == null ||
      environment.integrations.zeebe.gatewayAddress == null ||
      environment.integrations.zeebe.gatewayAddress.length <= 0) {
      this.logger.log(`Skipping Zeebe integration due to missing authorization credentials`);
      return;
    }

    this.logger.log(`Establishing connection to Zeebe on "${environment.integrations.zeebe.gatewayAddress}" using authorization server "${environment.integrations.zeebe.authorizationServerUrl}"`);
    const zeebeClientLogger = new Logger('ZeebeClient');
    this.zeebeClient = new ZBClient(environment.integrations.zeebe.gatewayAddress, {
      oAuth: {
        url: environment.integrations.zeebe.authorizationServerUrl,
        audience: environment.integrations.zeebe.audience,
        clientId: environment.integrations.zeebe.clientId,
        clientSecret: environment.integrations.zeebe.clientSecret
      },
      eagerConnection: true,
      retry: true,
      stdout: {
        debug: (message) => zeebeClientLogger.debug(JSON.parse(message)['message']),
        info: (message) => zeebeClientLogger.log(JSON.parse(message)['message']),
        error: (message) => zeebeClientLogger.error(JSON.parse(message)['message'])
      },
      onReady: () => this.logger.log(`Zeebe connection established successfully`),
      onConnectionError: () => this.logger.warn(`Could not establish Zeebe connection`)
    });

    this.logger.log(`Creating projection for Zeebe integration "${this.zeebeProjectionName}"`);
    await this.persistence.createProjection(this.zeebeProjectionName, this.zeebeProjection);

    this.persistence.subscribeToAll(async (resolvedEvent) => {
      const { event } = resolvedEvent;
      if (event == null) return;

      const eventType = event?.type;
      const eventData = event.data as unknown;

      if (persistenceEvents.receivedWorkflow.sameAs(eventType)) await this.createWorkflow(eventData as WorkflowProposal);
      if (persistenceEvents.receivedWorkflowInstance.sameAs(eventType)) await this.launchWorkflowInstance(eventData as WorkflowInstanceProposal);
      if (persistenceEvents.receivedTransition.sameAs(eventType)) await this.advanceWorkflowInstance(eventData as WorkflowInstanceTransition);
    });
  }

  /** @inheritDoc */
  async onModuleDestroy() {
    this.logger.log(`Disable and delete Zeebe projection`);
    if (await this.persistence.existsProjection(this.zeebeProjectionName)) {
      await this.persistence.disableProjection(this.zeebeProjectionName);
      await this.persistence.deleteProjection(this.zeebeProjectionName);
    }

    this.logger.log(`Shutting down Zeebe integration`);
    await this.zeebeClient.close(20_000);
  }

  /**
   * Creates a workflow on Zeebe.
   * @param definition Workflow to be created.
   */
  async createWorkflow(definition: WorkflowProposal) {
    const name = definition.config.name ?? definition.workflowModel.id;
    this.logger.log(`Deploying workflow on Zeebe: ${name}}`);
    const response = await this.zeebeClient.deployProcess('./examples/traffic-light/pedestrian-traffic-light.bpmn');
    this.logger.log(`Deployed workflow on Zeebe: ${JSON.stringify(response)}`);
    await this.persistence.dispatchEvent(`zeebe`, zeebeDeployedProcess({
      key: response.key,
      definition: definition,
      processes: response.processes
    }));
  }

  /**
   * Launches a workflow instance.
   * @param definition Workflow instance proposal.
   */
  async launchWorkflowInstance(definition: WorkflowInstanceProposal) {
    this.logger.log(`Creating workflow instance on Zeebe`);

    const workflow = (await this.persistence
      .getProjectionResult<Record<string, { definition: WorkflowProposal, processes: ZeebeProcessMetadata[] }>>(this.zeebeProjectionName))
      [definition.workflowId];

    const response = await this.zeebeClient.createProcessInstance(workflow.processes[0]);
    this.logger.log(`Created workflow instance on Zeebe: ${JSON.stringify(response)}`);
    await this.persistence.dispatchEvent(`zeebe`, zeebeCreatedProcessInstance({
      definition: definition,
      instance: response
    }));

    this.logger.log(`Setup job workers on Zeebe`);
    const states = (workflow.definition.workflowModel as MachineConfig<any, any, any>).states;
    for (const [key, value] of Object.entries(states)) {
      this.logger.log(`  - Subscribe to task type: "${key}"`);
      this.zeebeClient.createWorker({
        taskType: key,
        taskHandler: (job) => {
          this.logger.log(`Task handler invoked for task type "${job.type}" with payload: ${JSON.stringify(job.variables)}`);
          this.workflow.advanceWorkflowInstance(
            workflow.definition.consistencyId,
            definition.consistencyId,
            {
              event: key,
              payload: job.variables
            }
          );
          return job.complete();
        },
        onReady: () => this.logger.log(`Task handler "${key}" ready!`),
        onConnectionError: () => this.logger.log(`Task handler "${key}" could not connect to Zeebe!`),
        onConnectionErrorHandler: (error) => this.logger.log(`Task handler "${key}" errored: ${JSON.stringify(error)}`)
      });
    }
  }

  async advanceWorkflowInstance(transition: WorkflowInstanceTransition) {
    this.logger.log(`Publish workflow transition message on Zeebe`);
  }
}
