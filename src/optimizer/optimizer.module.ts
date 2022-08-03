import { Module } from '@nestjs/common';
import { OptimizerService } from './optimizer.service';

@Module({
  providers: [OptimizerService],
  exports: [OptimizerService]
})
export class OptimizerModule {
}
