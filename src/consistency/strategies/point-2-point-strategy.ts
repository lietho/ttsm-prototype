import { HttpService } from "@nestjs/axios";
import { Body, Controller, Inject, Logger, Post } from "@nestjs/common";
import { firstValueFrom, Subject } from "rxjs";
import { CONSISTENCY_STRATEGY_PROVIDER_TOKEN } from "src/consistency/consistency.service";
import { randomEthereumAddress } from "../../core/utils";
import { environment } from "../../environment";
import { ConsistencyMessage } from "../models";
import { ConsistencyStrategy, Status } from "./consistency-strategy";

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
  async dispatch<T>(msg: ConsistencyMessage<T>): Promise<Status> {
    msg = { ...msg, commitmentReference: randomEthereumAddress() };
    this.logger.debug(`Dispatching new message: ${JSON.stringify(msg)}`);
    const result = await Promise.all(environment.consistency.p2p.peerUrls
      .map(async (url) => {
        this.logger.debug(`  - dispatching to "${url}"...`);
        return await firstValueFrom(this.http.post(url + '/_internal/consistency/p2p', msg));
      })
    ).then(() => 'OK' as Status, () => 'NOK' as Status);

    // The sender also has to receive the message
    this.receiveConsistencyMessage(msg);
    return result;
  }

  /** @inheritDoc */
  async getStatus(): Promise<Status> {
    return Promise.all(environment.consistency.p2p.peerUrls
      .map(async (url) => await firstValueFrom(this.http.get(url + '/ping')))
    ).then(() => 'OK', () => 'NOK');
  }
}

/**
 * Dedicated controller instance to prevent a second instance of the strategy to be created.
 */
@Controller('_internal/consistency/p2p')
export class Point2PointStrategyController {

  constructor(@Inject(CONSISTENCY_STRATEGY_PROVIDER_TOKEN) private readonly p2pStrategy: Point2PointStrategy) {
  }

  @Post()
  receiveConsistencyMessage<T>(@Body() msg: ConsistencyMessage<T>) {
    if (!(this.p2pStrategy instanceof Point2PointStrategy)) {
      throw new Error('This endpoint is only available when using the Point2Point (p2p) consistency strategy!');
    }

    return this.p2pStrategy.receiveConsistencyMessage(msg);
  }
}
