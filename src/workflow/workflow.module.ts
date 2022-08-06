import { Module } from '@nestjs/common';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { OptimizerModule } from '../optimizer';
import { PersistenceModule } from '../persistence';

@Module({
  controllers: [WorkflowController],
  providers: [WorkflowService],
  imports: [OptimizerModule, PersistenceModule]
})
export class WorkflowModule {
}
