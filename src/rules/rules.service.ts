import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { catchError, combineLatest, firstValueFrom, of } from 'rxjs';
import { WorkflowInstanceProposal, WorkflowInstanceTransition, WorkflowProposal } from '../workflow';
import { RuleServiceValidationError } from './models';
import { PersistenceService } from '../persistence';
import * as persistenceEvents from '../persistence/persistence.events';

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
      if (persistenceEvents.proposeWorkflow.sameAs(eventType)) {
        const proposal = eventData as WorkflowProposal;
        const validationErrors = await this.validateWorkflowProposal(proposal);
        if (validationErrors.length <= 0) {
          await this.persistence.workflowProposalAcceptedByRuleService({ id: proposal.consistencyId, proposal });
        } else {
          await this.persistence.workflowProposalRejectedByRuleService({ id: proposal.consistencyId, proposal, validationErrors });
        }
      }

      // Validate against all registered rule services if the workflow instance launch is valid
      if (persistenceEvents.launchWorkflowInstance.sameAs(eventType)) {
        const proposal = eventData as WorkflowInstanceProposal;
        const validationErrors = await this.validateLaunchWorkflowInstance(proposal);
        if (validationErrors.length <= 0) {
          await this.persistence.workflowInstanceAcceptedByRuleService({ id: proposal.consistencyId, proposal });
        } else {
          await this.persistence.workflowInstanceRejectedByRuleService({ id: proposal.consistencyId, proposal, validationErrors });
        }
      }

      // Validate against all registered rule services if the state transition is valid
      if (persistenceEvents.advanceWorkflowInstance.sameAs(eventType)) {
        const transition = eventData as WorkflowInstanceTransition;
        const validationErrors = await this.validatePerformStateTransition(transition);
        if (validationErrors.length <= 0) {
          await this.persistence.workflowInstanceTransitionAcceptedByRuleService({ id: transition.id, transition });
        } else {
          await this.persistence.workflowInstanceTransitionRejectedByRuleService({ id: transition.id, transition, validationErrors });
        }
      }
    });
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
  async validateLaunchWorkflowInstance(proposal: WorkflowInstanceProposal): Promise<RuleServiceValidationError[]> {
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
  async validatePerformStateTransition(transition: WorkflowInstanceTransition): Promise<RuleServiceValidationError[]> {
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
    return await this.persistence.registerRuleService({ name, url });
  }

  /**
   * Unregisters an existing rule service.
   * @param id Rule service ID.
   */
  async unregisterRuleService(id: string) {
    const ruleService = await this.persistence.getRegisteredRuleServiceById(id);
    if (ruleService == null) throw new NotFoundException(`Rule service "${id}" does not exist`);
    return await this.persistence.unregisterRuleService(id);
  }

  /**
   * Returns all currently registered rule services.
   */
  async getRegisteredRuleServices() {
    return this.persistence.getAllRegisteredRuleServices();
  }
}
