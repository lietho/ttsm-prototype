import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CONSISTENCY_STRATEGY_PROVIDER_TOKEN, ConsistencyService } from './consistency.service';
import { NoopStrategy } from './strategies';

@Module({
  imports: [HttpModule],
  exports: [ConsistencyService],
  providers: [
    ConsistencyService,
    {
      provide: CONSISTENCY_STRATEGY_PROVIDER_TOKEN,
      useClass: NoopStrategy
    }
  ]
})
export class ConsistencyModule {
}
