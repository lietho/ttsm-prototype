import { Module } from '@nestjs/common';
import { ZeebeController } from './zeebe.controller';
import { ZeebeService } from './zeebe.service';
import { PersistenceModule } from '../../persistence';
import { WorkflowModule } from '../../workflow';

@Module({
  imports: [
    PersistenceModule,
    WorkflowModule
  ],
  controllers: [ZeebeController],
  providers: [ZeebeService]
})
export class ZeebeModule {
}
