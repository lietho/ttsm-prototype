import { Inject, Injectable, Logger } from '@nestjs/common';
import { Subject } from 'rxjs';

import { ConsistencyMessage } from './models';
import { ConsistencyStrategy } from './strategies';


/**
 * Use this token as provider token to create an injectable instance for some consistency strategy.
 */
export const CONSISTENCY_STRATEGY_PROVIDER_TOKEN = 'CONSISTENCY_STRATEGY';

/**
 * Service that connects to the consistency stack to publish and receive messages. Most parameters for this
 * service can be configured in the gateways environment.
 */
@Injectable()
export class ConsistencyService implements ConsistencyStrategy {

  private readonly log = new Logger(ConsistencyService.name);
  readonly actions$: Subject<ConsistencyMessage>;

  constructor(@Inject(CONSISTENCY_STRATEGY_PROVIDER_TOKEN) private readonly consistencyStrategy: ConsistencyStrategy) {
    this.actions$ = this.consistencyStrategy.actions$;
    this.log.log(`Using "${this.consistencyStrategy.constructor.name}" as consistency strategy implementation`);
    if (this.actions$ == null) {
      this.log.error(`Actions stream for provided consistency strategy is undefined. Please provide an appropriate stream implementation.`);
    }
  }

  /** @inheritDoc */
  async getStatus() {
    if (this.consistencyStrategy == null) {
      this.log.error(`No consistency strategy attached, use the provider token "${CONSISTENCY_STRATEGY_PROVIDER_TOKEN}" to inject a strategy`);
      return null;
    }
    return this.consistencyStrategy.getStatus();
  }

  /** @inheritDoc */
  async dispatch(msg: ConsistencyMessage) {
    if (this.consistencyStrategy == null) {
      this.log.error(`No consistency strategy attached, use the provider token "${CONSISTENCY_STRATEGY_PROVIDER_TOKEN}" to inject a strategy`);
      return null;
    }
    return this.consistencyStrategy.dispatch(msg);
  }
}
