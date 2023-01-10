import { Logger } from "@nestjs/common";
import { Subject } from "rxjs";
import { randomEthereumAddress } from "../../core/utils";
import { ConsistencyMessage } from "../models";
import { ConsistencyStrategy, Status } from "./consistency-strategy";

/**
 * This strategy does not use any consistency algorithms or backend services whatsoever. A dispatched messaged will
 * directly be fed back to the {@link ConsistencyStrategy.actions$} stream after a preconfigured delay in milliseconds
 * (default is 500 ms; can be configured with {@link NoopStrategy.delay}).
 */
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

    return Promise.resolve("OK" as Status);
  }

  /** @inheritDoc */
  async getStatus(): Promise<Status> {
    return 'OK' as Status;
  }

  getOrganizationIdentifier(): string {
    throw new Error("Method not implemented.");
  }
}
