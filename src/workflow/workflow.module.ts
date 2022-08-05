import { Module } from '@nestjs/common';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { OptimizerModule } from '../optimizer';
import { PersistenceModule } from '../persistence';
import { RulesModule } from '../rules';

@Module({
  controllers: [WorkflowController],
  providers: [WorkflowService],
  imports: [OptimizerModule, RulesModule, PersistenceModule]
})
export class WorkflowModule {
}
