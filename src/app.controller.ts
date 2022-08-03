import { Controller, Get } from '@nestjs/common';
import { ConsistencyService } from './consistency';
import { ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';

@Controller()
@ApiProduces('text/plain')
@ApiTags('Utils')
export class AppController {

  constructor(private consistency: ConsistencyService) {
  }

  @Get('/ping')
  @ApiOperation({
    summary: 'Ping',
    description: 'Clients can send a ping request to check if the service is up and running.'
  })
  @ApiOkResponse({ description: 'The service is fine' })
  ping(): string {
    return 'pong';
  }

  @Get('/health')
  @ApiOperation({
    summary: 'Health check',
    description: 'Clients can check if this service is up and running and if all child services that are required for nominal operation are also healthy.'
  })
  @ApiOkResponse({ description: 'The service and all required child services are fine' })
  async health() {
    await this.consistency.getStatus();
    return 'Just fine!';
  }
}
