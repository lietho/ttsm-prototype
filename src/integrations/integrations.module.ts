import { Module } from '@nestjs/common';
import { ZeebeModule } from './zeebe';

@Module({
  imports: [ZeebeModule]
})
export class IntegrationsModule {}
