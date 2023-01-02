import { HttpService } from "@nestjs/axios";
import { Body, Controller, Inject, Logger, OnModuleInit, Post, Provider } from "@nestjs/common";
import { performance } from "perf_hooks";
import { firstValueFrom, Subject } from "rxjs";
import { CONSISTENCY_STRATEGY_PROVIDER_TOKEN } from "src/consistency/consistency.service";
import Web3 from "web3";
import { ethereumSha256 } from "../../core/utils";
import { environment } from "../../environment";
import { ConsistencyMessage } from "../models";
import { ConsistencyStrategy, Status } from "./consistency-strategy";
import { EvmStrategyAbi } from "./evm-strategy.abi";


/**
 * Use this token as provider token to inject an instance of web3.js.
 * @see {@link https://web3js.readthedocs.io/ web3.js}
 */
export const EVM_WEB3_PROVIDER_TOKEN = 'EVM_WEB3';

/**
 * The provider for web3.js for the EVM strategy.
 */
export const EvmWeb3Provider: Provider = {
  provide: EVM_WEB3_PROVIDER_TOKEN,
  useFactory: () => new Web3(new Web3.providers.WebsocketProvider(environment.consistency.evm.provider))
};

/**
 * A consistency strategy that operates on the Ethereum virtual machine. It utilizes a smart contract that stores
 * the hashes of messages exchanged over a peer-to-peer network.
 */
export class EvmStrategy implements ConsistencyStrategy, OnModuleInit {

  private readonly logger = new Logger(EvmStrategy.name);

  /** @inheritDoc */
  readonly actions$ = new Subject<ConsistencyMessage<unknown>>();
  readonly contractAvailable$ = new Subject<any>();

  private contract;

  constructor(@Inject(EVM_WEB3_PROVIDER_TOKEN) private web3: Web3,
              private http: HttpService) {
  }

  /** @inheritDoc */
  async onModuleInit() {
    if (environment.consistency.strategy !== 'evm') {
      return;
    }
    this.logger.log(`Establishing connection to EVM on "${environment.consistency.evm.provider}" using client address "${environment.consistency.evm.clientAddress}"`);
    this.logger.log(`Current EVM block number: ${await this.web3.eth.getBlockNumber()}`);
    this.contract = new this.web3.eth.Contract(
      EvmStrategyAbi as any,
      environment.consistency.evm.contractAddress
    );
    this.contractAvailable$.next(this.contract);
  }

  async receiveConsistencyMessage<T>(msg: ConsistencyMessage<T>) {
    this.logger.debug(`Consistency message received: ${JSON.stringify(msg)}`);

    // Retrieve transaction receipt to check if log contains correct message hash
    const transaction = await this.web3.eth.getTransactionReceipt(msg.commitmentReference.transactionHash);

    // There is no transaction log available, that's weird...
    if (transaction.logs.length <= 0) {
      this.logger.warn(`Expected at least one transaction log to be emitted, but got none. Ignoring message...`);
      return 'NO_EVENT_LOGS';
    }

    // Do the expected and the actual hash of the message payload differ?
    const expectedHash = transaction.logs[0].data;
    const actualHash = ethereumSha256(JSON.stringify(msg.payload));
    if (expectedHash !== actualHash) {
      this.logger.warn(`Expected message payload hash "${expectedHash}", but got "${actualHash}". Ignoring message...`);
      return 'INVALID_HASH';
    }

    // Everything is fine, go on.
    this.actions$.next(msg);
    return 'OK';
  }

  /** @inheritDoc */
  async dispatch<T>(msg: ConsistencyMessage<T>): Promise<Status> {

    // Stringify the payload to hash it
    const messageAsString = JSON.stringify(msg.payload);
    this.logger.debug(`Dispatching new message: ${messageAsString}`);

    // Hash the payload of the message ONLY!
    const messageHash = ethereumSha256(messageAsString);
    this.logger.debug(`Storing SHA-256 message hash on EVM: "${messageHash}"`);

    // Store the hash of the message payload on the EVM and add the transaction result as
    // commitment reference to the message
    const finalityRequestTime = performance.now();
    const transactionResult = await this.contract.methods
      .store(messageHash)
      .send({ from: environment.consistency.evm.clientAddress });
    const finalityCompletionTime = performance.now();
    msg.commitmentReference = {
      ...transactionResult,
      finalityDuration: (finalityCompletionTime - finalityRequestTime)
    };
    this.logger.debug(`Sending message with commitment reference: ${JSON.stringify(msg)}`);

    // Send the message to all peers
    const result = await Promise.all(environment.consistency.evm.peerUrls
      .map(async (url) => {
        this.logger.debug(`Sending message over a peer-to-peer network to "${url}"...`);
        return await firstValueFrom(this.http.post(url + '/_internal/consistency/evm', msg));
      })
    ).then(() => 'OK' as Status, () => 'NOK' as Status);

    // The sender also has to receive the message
    await this.receiveConsistencyMessage(msg);
    return result;
  }

  /** @inheritDoc */
  async getStatus(): Promise<Status> {
    return Promise.all(environment.consistency.evm.peerUrls
      .map(async (url) => await firstValueFrom(this.http.get(url + '/ping')))
    ).then(() => 'OK', () => 'NOK');
  }
}

/**
 * Dedicated controller instance to prevent a second instance of the strategy to be created.
 */
@Controller('_internal/consistency/evm')
export class EvmStrategyController {

  constructor(@Inject(CONSISTENCY_STRATEGY_PROVIDER_TOKEN) private evmStrategy: EvmStrategy) {
  }

  @Post()
  async receiveConsistencyMessage<T>(@Body() msg: ConsistencyMessage<T>) {
    if (!(this.evmStrategy instanceof EvmStrategy)) {
      throw new Error('This endpoint is only available when using the EvmStrategy (evm) consistency strategy!');
    }

    return await this.evmStrategy.receiveConsistencyMessage(msg);
  }
}
