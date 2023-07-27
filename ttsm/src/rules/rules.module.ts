import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { RulesController } from './rules.controller';
import { RulesService } from './rules.service';
import { PersistenceModule } from '../persistence';

@Module({
  controllers: [RulesController],
  providers: [RulesService],
  imports: [HttpModule, PersistenceModule],
  exports: [RulesService]
})
export class RulesModule {
}
