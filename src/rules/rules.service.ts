import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { catchError, combineLatest, firstValueFrom, of } from 'rxjs';
import { PersistenceService } from '../persistence';
import { Workflow, WorkflowInstanceStateTransition } from '../workflow';
import { ValidationError } from './models';

@Injectable()
export class RulesService {

  private readonly logger = new Logger(RulesService.name);

  constructor(private http: HttpService,
              private persistence: PersistenceService) {
  }

  /**
   * Checks if the launch of a new workflow instance is allowed.
   * @param workflow Workflow instance to be launched.
   */
  async validateLaunchWorkflowInstance(workflow: Omit<Workflow, 'commitmentReference'>): Promise<ValidationError[]> {
    const ruleServices = await this.persistence.getAllRegisteredRuleServices();
    if (ruleServices.length <= 0) {
      return [];
    }
    const result = await firstValueFrom(combineLatest(ruleServices.map((curr) => this.http
      .post<ValidationError>(`${curr.url}/check-new-instance`, workflow)
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
  async validatePerformStateTransition(transition: Omit<WorkflowInstanceStateTransition, 'to' | 'commitmentReference'>): Promise<ValidationError[]> {
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
