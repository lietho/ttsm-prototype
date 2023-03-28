import { HttpModule } from "@nestjs/axios";
import { Module, Type } from "@nestjs/common";
import { OrbitDBEvmStrategy } from "src/consistency/strategies/orbitdb-evm/orbitdb-evm-strategy";
import { OrbitDBStrategy } from "src/consistency/strategies/orbitdb-strategy";
import { WorkflowModule } from "src/workflow";
import { environment } from "../environment";
import { PersistenceModule } from "../persistence";
import { CONSISTENCY_STRATEGY_PROVIDER_TOKEN, ConsistencyService } from "./consistency.service";
import {
  ConsistencyStrategy,
  EvmStrategy,
  EvmStrategyController,
  EvmWeb3Provider,
  NoopStrategy,
  Point2PointStrategy,
  Point2PointStrategyController
} from "./strategies";

/**
 * Contains all currently supported consistency strategies.
 */
export type SupportedConsistencyStrategies = 'noop' | 'p2p' | 'evm' | 'orbitdb' | 'orbitdb-evm';

const consistencyStrategy = (): Type<ConsistencyStrategy> => {
  // Chooses an applicable consistency strategy depending on the global configuration.
  switch (environment.consistency.strategy) {
    case 'p2p': return Point2PointStrategy;
    case 'evm': return EvmStrategy;
    case 'orbitdb': return OrbitDBStrategy;
    case 'orbitdb-evm': return OrbitDBEvmStrategy;
    default: return NoopStrategy;
  }
}

@Module({
  imports: [HttpModule, PersistenceModule, WorkflowModule],
  exports: [ConsistencyService],
  controllers: [
    Point2PointStrategyController,
    EvmStrategyController
  ],
  providers: [
    ConsistencyService,
    EvmWeb3Provider,
    {
      provide: CONSISTENCY_STRATEGY_PROVIDER_TOKEN,
      useClass: consistencyStrategy()
    }
  ]
})
export class ConsistencyModule {
}
