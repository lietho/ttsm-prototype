import { Body, Controller, Logger, Post } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, Subject } from 'rxjs';
import { ConsistencyStrategy } from './consistency-strategy';
import { ConsistencyMessage } from '../models';
import { environment } from '../../environment';
import { randomEthereumAddress } from '../../core/utils';

export class Point2PointStrategy implements ConsistencyStrategy {

  private readonly logger = new Logger(Point2PointStrategy.name);
  readonly actions$ = new Subject<ConsistencyMessage<unknown>>();

  constructor(private http: HttpService) {
  }

  receiveConsistencyMessage(msg: ConsistencyMessage<any>) {
    this.logger.debug(`Consistency message received: ${JSON.stringify(msg)}`);
    this.actions$.next(msg);
    return 'OK';
  }

  /** @inheritDoc */
  dispatch<T>(msg: ConsistencyMessage<T>) {
    msg = { ...msg, commitmentReference: randomEthereumAddress() };
    this.logger.debug(`Dispatching new message: ${JSON.stringify(msg)}`);
    const result = Promise.all(environment.consistency.p2p.peerUrls
      .map(async (url) => {
        this.logger.debug(`  - dispatching to "${url}"...`);
        return await firstValueFrom(this.http.post(url + '/_internal/consistency/p2p', msg));
      })
    );

    // The sender also has to receive the message
    this.receiveConsistencyMessage(msg);
    return result;
  }

  /** @inheritDoc */
  async getStatus() {
    return Promise.all(environment.consistency.p2p.peerUrls
      .map(async (url) => await firstValueFrom(this.http.get(url + '/ping')))
    );
  }
}

/**
 * Dedicated controller instance to prevent a second instance of the strategy to be created.
 */
@Controller('_internal/consistency/p2p')
export class Point2PointStrategyController {

  constructor(private p2pStrategy: Point2PointStrategy) {
  }

  @Post()
  receiveConsistencyMessage<T>(@Body() msg: ConsistencyMessage<T>) {
    return this.p2pStrategy.receiveConsistencyMessage(msg);
  }
}
