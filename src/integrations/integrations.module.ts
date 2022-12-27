import { Module } from '@nestjs/common';

@Module({
  // disable ZeebeModule temporarily for Refactoring
  // imports: [ZeebeModule]
  imports: []
})
export class IntegrationsModule {}
