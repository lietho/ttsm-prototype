import { jsonEvent, MetadataType } from "@eventstore/db-client";
import { HttpService } from "@nestjs/axios";
import { Injectable, Logger, NotFoundException, OnModuleInit } from "@nestjs/common";
import { catchError, combineLatest, firstValueFrom, of } from "rxjs";
import { environment } from "src/environment";
import { RULE_SERVICES_PROJECTION, RULE_SERVICES_PROJECTION_NAME } from "src/rules/eventstoredb/projections";
import { randomUUIDv4 } from "../core/utils";
import { PersistenceEvent, PersistenceService } from "../persistence";
import * as persistenceEvents from "../persistence/persistence.events";
import { WorkflowInstanceProposal, WorkflowInstanceTransition, WorkflowProposal } from "../workflow";
import { client as eventStore, connect as connectToEventStore } from "./eventstoredb";
import { RuleService, RuleServiceResponse } from "./models";
import * as ruleEvents from "./rules.events";

@Injectable()
export class RulesService implements OnModuleInit {

  private readonly logger = new Logger(RulesService.name);

  constructor(private http: HttpService,
              private persistence: PersistenceService) {
  }

  /** @inheritDoc */
  async onModuleInit() {
    this.logger.log(`Establishing connection to event store on "${environment.persistence.eventStore.serviceUrl}"`);
    await connectToEventStore();

    this.logger.log(`Creating event store projections: ${RULE_SERVICES_PROJECTION_NAME}`);
    await eventStore.createProjection(RULE_SERVICES_PROJECTION_NAME, RULE_SERVICES_PROJECTION);

    this.persistence.subscribeToAll(async (eventType: string, eventData: unknown) => {
      this.logger.log(`Received Event: ${eventType}`);
      // Validate against all registered rule services if the proposal is valid
      if (persistenceEvents.proposeWorkflow.sameAs(eventType)) await this.onLocalWorkflowProposal(eventData as WorkflowProposal);
      if (persistenceEvents.receivedWorkflow.sameAs(eventType)) await this.onExternalWorkflowProposal(eventData as WorkflowProposal);

      // Validate against all registered rule services if the workflow instance launch is valid
      if (persistenceEvents.launchWorkflowInstance.sameAs(eventType)) await this.onLocalWorkflowInstance(eventData as WorkflowInstanceProposal);
      if (persistenceEvents.receivedWorkflowInstance.sameAs(eventType)) await this.onExternalWorkflowInstance(eventData as WorkflowInstanceProposal);

      // Validate against all registered rule services if the state transition is valid
      if (persistenceEvents.advanceWorkflowInstance.sameAs(eventType)) await this.onLocalInstanceTransition(eventData as WorkflowInstanceTransition);
      if (persistenceEvents.receivedTransition.sameAs(eventType)) await this.onExternalInstanceTransition(eventData as WorkflowInstanceTransition);
    });
  }

  /**
   * Checks if the proposed workflow is valid.
   * @param proposal Workflow to be proposed.
   */
  async validateWorkflowProposal(proposal: WorkflowProposal): Promise<RuleServiceResponse[]> {
    const ruleServices = await this.getAllRegisteredRuleServices();
    if (ruleServices.length <= 0) {
      return [];
    }
    const result = await firstValueFrom(combineLatest(ruleServices.map((curr) => this.http
      .post<RuleServiceResponse>(`${curr.url}/check-new-workflow`, proposal)
      .pipe(catchError(() => {
        this.logger.warn(`Rule service "${curr.name}" does not respond on ${curr.url} - ignore`);
        return of(null);
      }))
    )));
    return result
      .map((response) => response?.data)
      .filter((response) => !response?.valid);
  }

  /**
   * Checks if the launch of a new workflow instance is allowed.
   * @param proposal Workflow instance to be launched.
   */
  async validateWorkflowInstance(proposal: WorkflowInstanceProposal): Promise<RuleServiceResponse[]> {
    const ruleServices = await this.getAllRegisteredRuleServices();
    if (ruleServices.length <= 0) {
      return [];
    }
    const result = await firstValueFrom(combineLatest(ruleServices.map((curr) => this.http
      .post<RuleServiceResponse>(`${curr.url}/check-new-instance`, proposal)
      .pipe(catchError(() => {
        this.logger.warn(`Rule service "${curr.name}" does not respond on ${curr.url} - ignore`);
        return of(null);
      }))
    )));
    return result
      .map((response) => response?.data)
      .filter((response) => !response?.valid);
  }

  /**
   * Checks if a state transition is allowed.
   * @param transition Workflow instance state transition.
   */
  async validateInstanceTransition(transition: WorkflowInstanceTransition): Promise<RuleServiceResponse[]> {
    const ruleServices = await this.getAllRegisteredRuleServices();
    if (ruleServices.length <= 0) {
      return [];
    }
    const result = await firstValueFrom(combineLatest(ruleServices.map((curr) => this.http
      .post(`${curr.url}/check-state-transition`, transition)
      .pipe(catchError(() => {
        this.logger.warn(`Rule service "${curr.name}" does not respond on ${curr.url} - ignore`);
        return of(null);
      }))
    )));
    return result
      .map((response) => response?.data)
      .filter((response) => !response?.valid);
  }

  /**
   * Registers a new rule service.
   * @param name Rule service name.
   * @param url Callback URL.
   */
  async registerRuleService(name: string, url: string) {
    if (url.endsWith("/")) {
      url = url.substring(0, url.length - 1);
    }
    const ruleService: RuleService = { name, url, id: randomUUIDv4() };
    await this.dispatchRulesEvent(ruleService.id, ruleEvents.registerRuleService(ruleService));
    return ruleService;
  }

  /**
   * Unregisters an existing rule service.
   * @param id Rule service ID.
   */
  async unregisterRuleService(id: string) {
    const ruleService = await this.getRegisteredRuleServiceById(id);
    if (ruleService == null) throw new NotFoundException(`Rule service "${id}" does not exist`);
    await this.dispatchRulesEvent(id, ruleEvents.unregisterRuleService({ id }));
  }

  /** @inheritDoc */
  async onModuleDestroy() {
    this.logger.log(`Disable and delete all used projections`);
    if (await this.existsProjection(RULE_SERVICES_PROJECTION_NAME)) {
      await eventStore.disableProjection(RULE_SERVICES_PROJECTION_NAME);
      await eventStore.deleteProjection(RULE_SERVICES_PROJECTION_NAME);
    }
  }

  /**
   * Returns all rule services registered.
   */
  async getAllRegisteredRuleServices(): Promise<RuleService[]> {
    return Object
      .entries(await this.getRuleServicesAggregate())
      .map(([, ruleService]) => ruleService);
  }

  /**
   * Checks if the local workflow proposal is valid or not and dispatches an appropriate follow up event.
   * @param proposal
   * @private
   */
  private async onLocalWorkflowProposal(proposal: WorkflowProposal) {
    const validationErrors = await this.validateWorkflowProposal(proposal);
    if (validationErrors.length <= 0) {
      await this.persistence.dispatchWorkflowEvent(
        proposal.consistencyId,
        persistenceEvents.localWorkflowAcceptedByRuleService({ id: proposal.consistencyId, proposal })
      );
    } else {
      await this.persistence.dispatchWorkflowEvent(
        proposal.consistencyId,
        persistenceEvents.localWorkflowRejectedByRuleService({ id: proposal.consistencyId, proposal, validationErrors })
      );
    }
  }

  /**
   * Checks if the external workflow proposal is valid or not and dispatches an appropriate follow up event.
   * @param proposal
   * @private
   */
  private async onExternalWorkflowProposal(proposal: WorkflowProposal) {
    const validationErrors = await this.validateWorkflowProposal(proposal);
    if (validationErrors.length <= 0) {
      await this.persistence.dispatchWorkflowEvent(
        proposal.consistencyId,
        persistenceEvents.receivedWorkflowAcceptedByRuleService({ id: proposal.consistencyId, proposal })
      );
    } else {
      await this.persistence.dispatchWorkflowEvent(
        proposal.consistencyId,
        persistenceEvents.receivedWorkflowRejectedByRuleService({
          id: proposal.consistencyId,
          proposal,
          validationErrors
        })
      );
    }
  }

  /**
   * Checks if the local workflow instance is valid or not and dispatches an appropriate follow up event.
   * @param proposal
   * @private
   */
  private async onLocalWorkflowInstance(proposal: WorkflowInstanceProposal) {
    const validationErrors = await this.validateWorkflowInstance(proposal);
    if (validationErrors.length <= 0) {
      await this.persistence.dispatchInstanceEvent(
        proposal.consistencyId,
        persistenceEvents.localWorkflowInstanceAcceptedByRuleService({
          id: proposal.consistencyId,
          workflowId: proposal.workflowId,
          organizationId: proposal.organizationId,
          proposal
        })
      );
    } else {
      await this.persistence.dispatchInstanceEvent(
        proposal.consistencyId,
        persistenceEvents.localWorkflowInstanceRejectedByRuleService({
          id: proposal.consistencyId,
          workflowId: proposal.workflowId,
          organizationId: proposal.organizationId,
          proposal,
          validationErrors
        })
      );
    }
  }

  /**
   * Checks if the external workflow instance is valid or not and dispatches an appropriate follow up event.
   * @param proposal
   * @private
   */
  private async onExternalWorkflowInstance(proposal: WorkflowInstanceProposal) {
    const validationErrors = await this.validateWorkflowInstance(proposal);
    if (validationErrors.length <= 0) {
      await this.persistence.dispatchInstanceEvent(
        proposal.consistencyId,
        persistenceEvents.receivedWorkflowInstanceAcceptedByRuleService({
          id: proposal.consistencyId,
          workflowId: proposal.workflowId,
          organizationId: proposal.organizationId,
          proposal
        })
      );
    } else {
      await this.persistence.dispatchInstanceEvent(
        proposal.consistencyId,
        persistenceEvents.receivedWorkflowInstanceRejectedByRuleService({
          id: proposal.consistencyId,
          workflowId: proposal.workflowId,
          organizationId: proposal.organizationId,
          proposal,
          validationErrors
        })
      );
    }
  }

  /**
   * Checks if the local instance transition is valid or not and dispatches an appropriate follow up event.
   * @param transition
   * @private
   */
  private async onLocalInstanceTransition(transition: WorkflowInstanceTransition) {
    const validationErrors = await this.validateInstanceTransition(transition);
    if (validationErrors.length <= 0) {
      await this.persistence.dispatchTransitionEvent(
        transition.id,
        persistenceEvents.localTransitionAcceptedByRuleService({
          id: transition.id,
          workflowId: transition.workflowId,
          organizationId: transition.organizationId,
          transition
        })
      );
    } else {
      await this.persistence.dispatchTransitionEvent(
        transition.id,
        persistenceEvents.localTransitionRejectedByRuleService({
          id: transition.id,
          workflowId: transition.workflowId,
          organizationId: transition.organizationId,
          transition,
          validationErrors
        })
      );
    }
  }

  /**
   * Checks if the external instance transition is valid or not and dispatches an appropriate follow up event.
   * @param transition
   * @private
   */
  private async onExternalInstanceTransition(transition: WorkflowInstanceTransition) {
    const validationErrors = await this.validateInstanceTransition(transition);
    if (validationErrors.length <= 0) {
      await this.persistence.dispatchTransitionEvent(
        transition.id,
        persistenceEvents.receivedTransitionAcceptedByRuleService({
          id: transition.id,
          workflowId: transition.workflowId,
          organizationId: transition.organizationId,
          transition
        })
      );
    } else {
      await this.persistence.dispatchTransitionEvent(
        transition.id,
        persistenceEvents.receivedTransitionRejectedByRuleService({
          id: transition.id,
          workflowId: transition.workflowId,
          organizationId: transition.organizationId,
          transition,
          validationErrors
        })
      );
    }
  }

  /**
   * Returns a registered rule service by its ID.
   * @param id
   */
  private async getRegisteredRuleServiceById(id: string): Promise<RuleService> {
    return (await this.getRuleServicesAggregate())[id];
  }

  /**
   * Returns the projected aggregate of all rule services.
   * @private
   */
  private async getRuleServicesAggregate(): Promise<Record<string, RuleService>> {
    return await eventStore.getProjectionResult<Record<string, RuleService>>(RULE_SERVICES_PROJECTION_NAME) ?? {};
  }

  /**
   * Dispatches a rules event.
   * @param id Rule service ID.
   * @param event Event to be dispatched.
   */
  private async dispatchRulesEvent<T>(id: string, event: PersistenceEvent<T>): Promise<void> {
    return await this.appendToStream(`rules.${id}`, event);
  }

  /**
   * Appends a single event to the stream with the given name.
   * @param streamName Stream name.
   * @param event Event data.
   */
  private async appendToStream(streamName: string, event: { type: string, data: any, metadata?: MetadataType }): Promise<void> {
    this.logger.debug(`Write to stream "${streamName}": ${JSON.stringify(event)}`);
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    return await eventStore.appendToStream(streamName, jsonEvent(event)).then(() => {});
  }

  /**
   * Checks if the projection with the given name already exists.
   * @param projectionName Name of the projection to be checked.
   */
  private async existsProjection(projectionName: string): Promise<boolean> {
    const projections = await eventStore.listProjections();
    for await (const projection of projections) {
      if (projection.name === projectionName) {
        return true;
      }
    }
    return false;
  }

}
