import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { RulesController } from './rules.controller';
import { RulesService } from './rules.service';
import { PersistenceModule } from '../persistence';
import { RulesEvaluatorAdapterController } from './rules-evaluator-adapter.controller';
import { RulesEvaluatorClientModule } from './rules-evaluator-client/rules-evaluator-client.module';
import { ConsistencyModule } from 'src/consistency';
import { WorkflowModule } from 'src/workflow';

@Module({
  controllers: [RulesController, RulesEvaluatorAdapterController],
  providers: [RulesService],
  imports: [HttpModule, PersistenceModule, WorkflowModule, ConsistencyModule, RulesEvaluatorClientModule ],
  exports: [RulesService]
})
export class RulesModule { 
}
