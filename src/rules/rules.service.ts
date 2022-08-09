import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { catchError, combineLatest, firstValueFrom, of } from 'rxjs';
import { WorkflowInstanceProposal, WorkflowInstanceTransition, WorkflowProposal } from '../workflow';
import { RuleService, RuleServiceValidationError } from './models';
import { PersistenceService } from '../persistence';
import * as persistenceEvents from '../persistence/persistence.events';
import * as ruleEvents from './rules.events';
import { randomUUIDv4 } from '../core/utils';

@Injectable()
export class RulesService implements OnModuleInit {

  private readonly logger = new Logger(RulesService.name);

  constructor(private http: HttpService,
              private persistence: PersistenceService) {
  }

  /** @inheritDoc */
  onModuleInit() {
    this.persistence.subscribeToAll(async (resolvedEvent) => {
      const { event } = resolvedEvent;
      if (event == null) return;

      const eventType = event?.type;
      const eventData = event.data as unknown;

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
   * Checks if the local workflow proposal is valid or not and dispatches an appropriate follow up event.
   * @param proposal
   * @private
   */
  private async onLocalWorkflowProposal(proposal: WorkflowProposal) {
    const validationErrors = await this.validateWorkflowProposal(proposal);
    if (validationErrors.length <= 0) {
      await this.persistence.dispatchInstanceEvent(
        proposal.consistencyId,
        persistenceEvents.localWorkflowAcceptedByRuleService({ id: proposal.consistencyId, proposal })
      );
    } else {
      await this.persistence.dispatchInstanceEvent(
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
      await this.persistence.dispatchInstanceEvent(
        proposal.consistencyId,
        persistenceEvents.receivedWorkflowAcceptedByRuleService({ id: proposal.consistencyId, proposal })
      );
    } else {
      await this.persistence.dispatchInstanceEvent(
        proposal.consistencyId,
        persistenceEvents.receivedWorkflowRejectedByRuleService({ id: proposal.consistencyId, proposal, validationErrors })
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
        persistenceEvents.localWorkflowInstanceAcceptedByRuleService({ id: proposal.consistencyId, proposal })
      );
    } else {
      await this.persistence.dispatchInstanceEvent(
        proposal.consistencyId,
        persistenceEvents.localWorkflowInstanceRejectedByRuleService({ id: proposal.consistencyId, proposal, validationErrors })
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
        persistenceEvents.receivedWorkflowInstanceAcceptedByRuleService({ id: proposal.consistencyId, proposal })
      );
    } else {
      await this.persistence.dispatchInstanceEvent(
        proposal.consistencyId,
        persistenceEvents.receivedWorkflowInstanceRejectedByRuleService({ id: proposal.consistencyId, proposal, validationErrors })
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
      await this.persistence.dispatchInstanceEvent(
        transition.id,
        persistenceEvents.localTransitionAcceptedByRuleService({ id: transition.id, transition })
      );
    } else {
      await this.persistence.dispatchInstanceEvent(
        transition.id,
        persistenceEvents.localTransitionRejectedByRuleService({ id: transition.id, transition, validationErrors })
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
      await this.persistence.dispatchInstanceEvent(
        transition.id,
        persistenceEvents.receivedTransitionAcceptedByRuleService({ id: transition.id, transition })
      );
    } else {
      await this.persistence.dispatchInstanceEvent(
        transition.id,
        persistenceEvents.receivedTransitionRejectedByRuleService({ id: transition.id, transition, validationErrors })
      );
    }
  }

  /**
   * Checks if the proposed workflow is valid.
   * @param proposal Workflow to be proposed.
   */
  async validateWorkflowProposal(proposal: WorkflowProposal): Promise<RuleServiceValidationError[]> {
    const ruleServices = await this.persistence.getAllRegisteredRuleServices();
    if (ruleServices.length <= 0) {
      return [];
    }
    const result = await firstValueFrom(combineLatest(ruleServices.map((curr) => this.http
      .post<RuleServiceValidationError>(`${curr.url}/check-new-workflow`, proposal)
      .pipe(catchError(() => {
        this.logger.warn(`Rule service "${curr.name}" does not respond on ${curr.url} - ignore`);
        return of(null);
      }))
    )));
    return result
      .map((response) => response?.data)
      .filter((validationError) => validationError != null);
  }

  /**
   * Checks if the launch of a new workflow instance is allowed.
   * @param proposal Workflow instance to be launched.
   */
  async validateWorkflowInstance(proposal: WorkflowInstanceProposal): Promise<RuleServiceValidationError[]> {
    const ruleServices = await this.persistence.getAllRegisteredRuleServices();
    if (ruleServices.length <= 0) {
      return [];
    }
    const result = await firstValueFrom(combineLatest(ruleServices.map((curr) => this.http
      .post<RuleServiceValidationError>(`${curr.url}/check-new-instance`, proposal)
      .pipe(catchError(() => {
        this.logger.warn(`Rule service "${curr.name}" does not respond on ${curr.url} - ignore`);
        return of(null);
      }))
    )));
    return result
      .map((response) => response?.data)
      .filter((validationError) => validationError != null);
  }

  /**
   * Checks if a state transition is allowed.
   * @param transition Workflow instance state transition.
   */
  async validateInstanceTransition(transition: WorkflowInstanceTransition): Promise<RuleServiceValidationError[]> {
    const ruleServices = await this.persistence.getAllRegisteredRuleServices();
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
      .filter((validationError) => validationError != null);
  }

  /**
   * Registers a new rule service.
   * @param name Rule service name.
   * @param url Callback URL.
   */
  async registerRuleService(name: string, url: string) {
    if (url.endsWith('/')) {
      url = url.substring(0, url.length - 1);
    }
    const ruleService: RuleService = { name, url, id: randomUUIDv4() };
    await this.persistence.dispatchRulesEvent(ruleService.id, ruleEvents.registerRuleService(ruleService));
    return ruleService;
  }

  /**
   * Unregisters an existing rule service.
   * @param id Rule service ID.
   */
  async unregisterRuleService(id: string) {
    const ruleService = await this.persistence.getRegisteredRuleServiceById(id);
    if (ruleService == null) throw new NotFoundException(`Rule service "${id}" does not exist`);
    await this.persistence.dispatchRulesEvent(id, ruleEvents.unregisterRuleService({ id }));
  }

  /**
   * Returns all currently registered rule services.
   */
  async getRegisteredRuleServices() {
    return this.persistence.getAllRegisteredRuleServices();
  }
}
