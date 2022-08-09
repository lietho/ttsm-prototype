import { Injectable, Logger } from '@nestjs/common';
import { Subject } from 'rxjs';
import { ConsistencyStrategy } from './consistency-strategy';
import { ConsistencyMessage } from '../models';
import { randomEthereumAddress } from '../../core/utils';

/**
 * This strategy does not use any consistency algorithms or backend services whatsoever. A dispatched messaged will
 * directly be fed back to the {@link ConsistencyStrategy.actions$} stream after a preconfigured delay in milliseconds
 * (default is 500 ms; can be configured with {@link NoopStrategy.delay}).
 */
@Injectable()
export class NoopStrategy implements ConsistencyStrategy {

  private readonly logger = new Logger(NoopStrategy.name);
  readonly actions$ = new Subject<ConsistencyMessage<unknown>>();

  /**
   * The simulated delay in milliseconds between dispatching a message and receiving it in the
   * NoopStrategy.actions$ stream. This might be useful for testing.
   */
  delay = 500;

  /** @inheritDoc */
  async dispatch<T>(msg: ConsistencyMessage<T>) {
    this.logger.log(`Dispatching new message: ${JSON.stringify(msg)}`);
    setTimeout(() => {
      msg = { ...msg, commitmentReference: randomEthereumAddress() };
      this.logger.log(`Consistency message received: ${JSON.stringify(msg)}`);
      this.actions$.next(msg);
    }, this.delay);
  }

  /** @inheritDoc */
  async getStatus() {
    return 'OK';
  }
}
