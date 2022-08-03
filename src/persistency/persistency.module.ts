import { Module } from '@nestjs/common';
import { PersistencyService } from './persistency.service';

@Module({
  providers: [PersistencyService]
})
export class PersistencyModule {}
