import { Module } from '@nestjs/common';
import { CoreModule } from './core';
import { AppController } from './app.controller';
import { WorkflowModule } from './workflow/workflow.module';
import { ConsistencyModule } from './consistency';
import { PersistenceModule } from './persistence';

@Module({
  imports: [CoreModule, WorkflowModule, ConsistencyModule, PersistenceModule],
  controllers: [AppController]
})
export class AppModule {
}
