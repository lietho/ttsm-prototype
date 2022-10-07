import { Body, Controller, Inject, Logger, OnModuleInit, Post, Provider } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, Subject } from 'rxjs';
import { ConsistencyStrategy } from './consistency-strategy';
import { ConsistencyMessage } from '../models';
import { environment } from '../../environment';
import { EvmStrategyAbi } from './evm-strategy.abi';
import Web3 from 'web3';
import * as crypto from 'crypto';


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
@Controller('_internal/consistency/evm')
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
    this.logger.log(`Establishing connection to EVM on "${environment.consistency.evm.provider}" using client address "${environment.consistency.evm.clientAddress}"`);
    this.logger.log(`Current EVM block number: ${await this.web3.eth.getBlockNumber()}`);
    this.contract = new this.web3.eth.Contract(
      EvmStrategyAbi as any,
      environment.consistency.evm.contractAddress
    );
    this.contractAvailable$.next(this.contract);
  }

  @Post()
  receiveConsistencyMessage(@Body() msg: ConsistencyMessage<any>) {
    this.logger.debug(`Consistency message received: ${JSON.stringify(msg)}`);
    this.actions$.next(msg);
    return 'OK';
  }

  /** @inheritDoc */
  async dispatch<T>(msg: ConsistencyMessage<T>) {
    const messageAsString = JSON.stringify(msg);
    this.logger.debug(`Dispatching new message: ${messageAsString}`);

    const messageHash = '0x' + crypto
      .createHash('sha256')
      .update(messageAsString)
      .digest('hex');

    this.logger.debug(`Storing SHA-256 message hash on EVM: "${messageHash}"`);
    const transactionResult = await this.contract.methods
      .store(messageHash)
      .send({ from: environment.consistency.evm.clientAddress });

    msg.commitmentReference = transactionResult;
    this.logger.debug(`Sending message with commitment reference: ${JSON.stringify(msg)}`);

    const result = await Promise.all(environment.consistency.evm.peerUrls
      .map(async (url) => {
        this.logger.debug(`Sending message over a peer-to-peer network to "${url}"...`);
        return await firstValueFrom(this.http.post(url + '/_internal/consistency/evm', msg));
      })
    );

    // The sender also has to receive the message
    this.receiveConsistencyMessage(msg);
    return result;
  }

  /** @inheritDoc */
  async getStatus() {
    return Promise.all(environment.consistency.evm.peerUrls
      .map(async (url) => await firstValueFrom(this.http.get(url + '/ping')))
    );
  }
}
