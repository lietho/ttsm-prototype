import { Module } from '@nestjs/common';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { WorkflowRepository } from './workflow.repository';
import { OptimizerModule } from '../optimizer';
import { ConsistencyModule } from '../consistency';
import { PersistenceModule } from '../persistence';

@Module({
  controllers: [WorkflowController],
  providers: [WorkflowService, WorkflowRepository],
  imports: [OptimizerModule, ConsistencyModule, PersistenceModule]
})
export class WorkflowModule {
}
