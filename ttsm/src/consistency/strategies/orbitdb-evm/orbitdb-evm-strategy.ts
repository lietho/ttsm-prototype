import { HttpService } from "@nestjs/axios";
import { Inject, Logger, OnApplicationBootstrap, Provider } from "@nestjs/common";
import { canonicalizeEx } from "json-canonicalize";
import { Subject } from "rxjs";
import { acceptTransition, advanceWorkflowInstance, rejectTransition } from "src/consistency/consistency.actions";
import { ConsistencyMessage } from "src/consistency/models";
import { ConsistencyStrategy, Status } from "src/consistency/strategies/consistency-strategy";
import { EvmStrategyAbi } from "src/consistency/strategies/orbitdb-evm/orbitdb-evm-strategy.abi";
import { OrbitDBStrategy } from "src/consistency/strategies/orbitdb-strategy";
import { ethereumSha256 } from "src/core/utils";
import { environment } from "src/environment";
import { PersistenceService } from "src/persistence";
import { OrbitDBEventLogManager } from "src/persistence/strategies/orbitdb/orbitdb-eventlog-manager";
import Web3 from "web3";
import Contract from "web3-eth-contract";

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
  useFactory: () => new Web3(new Web3.providers.WebsocketProvider(environment.consistency.orbitDB.evm.provider))
};

const EXTERNAL_CONSISTENCY_MESSAGES = [
  advanceWorkflowInstance,
  acceptTransition,
  rejectTransition
];

export class OrbitDBEvmStrategy implements ConsistencyStrategy, OnApplicationBootstrap {
  private readonly logger = new Logger(OrbitDBEvmStrategy.name);

  readonly actions$ = new Subject<ConsistencyMessage<unknown>>();

  readonly contractAvailable$ = new Subject<any>();

  private contract: Contract;

  private orbitDBStrategy: OrbitDBStrategy;

  constructor(@Inject(EVM_WEB3_PROVIDER_TOKEN) private web3: Web3,
              private http: HttpService,
              @Inject(OrbitDBEventLogManager) private dbManager: OrbitDBEventLogManager<ConsistencyMessage<unknown>>,
              private persistenceService: PersistenceService){
    this.logger.log(`Establishing connection to EVM on "${environment.consistency.orbitDB.evm.provider}" using client address "${environment.consistency.orbitDB.evm.clientAddress}"`);
    this.contract = new this.web3.eth.Contract(
      EvmStrategyAbi as any,
      environment.consistency.orbitDB.evm.contractAddress
    );

    if (environment.consistency.orbitDB.evm.SIGNER_PRIVATE_KEY != null) {
      const signer = web3.eth.accounts.privateKeyToAccount(
        environment.consistency.orbitDB.evm.SIGNER_PRIVATE_KEY
      );
      web3.eth.accounts.wallet.add(signer);
    }

    this.contractAvailable$.next(this.contract);
  }

  async onApplicationBootstrap() {
    this.orbitDBStrategy = new OrbitDBStrategy(this.http, this.dbManager, this.persistenceService);
    await this.orbitDBStrategy.init();
    this.orbitDBStrategy.actions$.subscribe(async msg => await this.receiveConsistencyMessage(msg));
  }

  async receiveConsistencyMessage(msg: ConsistencyMessage<any>) {
    this.logger.debug(`Consistency message received: ${JSON.stringify(msg)}`);

    if (OrbitDBEvmStrategy.needsCommitment(msg)) {
      // Retrieve transaction receipt to check if log contains correct message hash
      const transaction = await this.web3.eth.getTransactionReceipt(msg.commitment.reference);

      // There is no transaction log available, that's weird...
      if (transaction.logs.length <= 0) {
        this.logger.warn(`Expected at least one transaction log to be emitted, but got none. Ignoring message...`);
        throw new Error('NO_EVENT_LOGS');
      }

      // Do the expected and the actual hash of the message payload differ?
      const expectedHash = transaction.logs[0].data;

      const actualHash = OrbitDBEvmStrategy.generateCommitmentHash(msg);
      if (expectedHash !== actualHash) {
        this.logger.warn(`Expected message payload hash "${expectedHash}", but got "${actualHash}". Ignoring message...`);
        throw new Error('INVALID_HASH');
      }
    }

    // Everything is fine, go on.
    this.actions$.next(msg);
  }

  async dispatch<T>(msg: ConsistencyMessage<T>): Promise<Status> {
    // Stringify the payload to hash it
    const messageAsString = JSON.stringify(msg.payload);
    this.logger.debug(`Dispatching new message: ${messageAsString}`);

    if (OrbitDBEvmStrategy.needsCommitment(msg)) {
      const messageHash = OrbitDBEvmStrategy.generateCommitmentHash(msg);
      this.logger.debug(`Storing SHA-256 message hash on EVM: "${messageHash}"`);

      // Store the hash of the message payload on the EVM and add the transaction hash as
      // commitment reference to the message
      const txMethod = this.contract.methods.store(messageHash);
      const txParams = {
        from: environment.consistency.evm.clientAddress
      };

      const gas = await txMethod.estimateGas(txParams);
      const transactionResult = await txMethod
        .send({
          ...txParams,
          gas
        });

      const block = await this.web3.eth.getBlock(transactionResult.blockNumber);
      msg.commitment = { reference: transactionResult.transactionHash, timestamp: new Date(+block.timestamp * 1000) };
      this.logger.debug(`Sending message with commitment reference: ${JSON.stringify(msg)}`);
    } else {
      this.logger.debug(`Sending message without commitment reference: ${JSON.stringify(msg)}`);
    }

    return await this.orbitDBStrategy.dispatch(msg);
  }

  getOrganizationIdentifier(): string {
    return this.orbitDBStrategy.getOrganizationIdentifier();
  }

  getStatus(): Promise<Status> {
    return Promise.resolve("OK");
  }

  private static generateCommitmentHash<T>(message: ConsistencyMessage<T>): string {
    const json = JSON.stringify({
      ...message,
      commitmentReference: undefined
    });

    const canonifiedMessage = canonicalizeEx(JSON.parse(json));

    return ethereumSha256(canonifiedMessage);
  }

  private static needsCommitment<T>(message: ConsistencyMessage<T>): boolean {
    return EXTERNAL_CONSISTENCY_MESSAGES.some(msgFactory => msgFactory.sameAs(message));
  }
}