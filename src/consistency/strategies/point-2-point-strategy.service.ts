import { Body, Controller, Logger, Post } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, Subject } from 'rxjs';
import { ConsistencyStrategy } from './consistency-strategy';
import { ConsistencyMessage } from '../models';
import { environment } from '../../environment';
import { randomEthereumAddress } from '../../core/utils';

@Controller('_internal/consistency/p2p')
export class Point2PointStrategy implements ConsistencyStrategy {

  private readonly logger = new Logger(Point2PointStrategy.name);
  readonly actions$ = new Subject<ConsistencyMessage>();

  constructor(private http: HttpService) {
  }

  @Post()
  receiveConsistencyMessage(@Body() msg: ConsistencyMessage) {
    this.logger.debug(`Consistency message received: ${JSON.stringify(msg)}`);
    this.actions$.next(msg);
    return 'OK';
  }

  /** @inheritDoc */
  dispatch(msg: ConsistencyMessage) {
    msg = { ...msg, commitmentReference: randomEthereumAddress() };
    this.logger.debug(`Dispatching new message: ${JSON.stringify(msg)}`);
    const result = firstValueFrom(this.http.post(environment.consistencyServiceUrl + '/_internal/consistency/p2p', msg));

    // The sender also has to receive the message
    this.receiveConsistencyMessage(msg);
    return result;
  }

  /** @inheritDoc */
  async getStatus() {
    return firstValueFrom(this.http.get(environment.consistencyServiceUrl + '/ping'));
  }
}
