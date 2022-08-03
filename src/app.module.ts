import { Module } from '@nestjs/common';
import { CoreModule } from './core';
import { AppController } from './app.controller';
import { WorkflowModule } from './workflow/workflow.module';
import { ConsistencyModule } from './consistency';
import { PersistencyModule } from './persistency/persistency.module';

@Module({
  imports: [CoreModule, WorkflowModule, ConsistencyModule, PersistencyModule],
  controllers: [AppController]
})
export class AppModule {
}
