import { Module } from '@nestjs/common';
import { CoreModule } from './core';
import { AppController } from './app.controller';
import { WorkflowModule } from './workflow';
import { ConsistencyModule } from './consistency';
import { PersistenceModule } from './persistence';
import { RulesModule } from './rules';

@Module({
  imports: [
    CoreModule,
    WorkflowModule,
    ConsistencyModule,
    PersistenceModule,
    RulesModule
  ],
  controllers: [AppController]
})
export class AppModule {
}
