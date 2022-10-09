import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CONSISTENCY_STRATEGY_PROVIDER_TOKEN, ConsistencyService } from './consistency.service';
import { EvmStrategy, EvmStrategyController, EvmWeb3Provider, NoopStrategy, Point2PointStrategy, Point2PointStrategyController } from './strategies';
import { PersistenceModule } from '../persistence';
import { environment } from '../environment';


/**
 * Contains all currently supported consistency strategies.
 */
export type SupportedConsistencyStrategies = 'noop' | 'p2p' | 'evm';

@Module({
  imports: [HttpModule, PersistenceModule],
  exports: [ConsistencyService],
  controllers: [
    Point2PointStrategyController,
    EvmStrategyController
  ],
  providers: [
    ConsistencyService,
    NoopStrategy,
    Point2PointStrategy,
    EvmStrategy,
    EvmWeb3Provider,
    {
      provide: CONSISTENCY_STRATEGY_PROVIDER_TOKEN,
      inject: [NoopStrategy, Point2PointStrategy, EvmStrategy],
      useFactory: (noopStrategy: NoopStrategy,
                   p2pStrategy: Point2PointStrategy,
                   evmStrategy: EvmStrategy) => {
        // Chooses an applicable consistency strategy depending on the global configuration.
        switch (environment.consistency.strategy) {
          case 'p2p':
            return p2pStrategy;
          case 'evm':
            return evmStrategy;
        }
        return noopStrategy;
      }
    }
  ]
})
export class ConsistencyModule {
}
