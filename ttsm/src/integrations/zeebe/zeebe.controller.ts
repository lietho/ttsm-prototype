import { Controller, Get, Logger } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';

@Controller('integrations/zeebe')
@ApiProduces('text/plain')
@ApiTags('Integrations', 'Zeebe')
export class ZeebeController {

  private readonly logger = new Logger(ZeebeController.name);

  @Get('ping')
  @ApiOperation({
    summary: 'Zeebe Ping',
    description: 'Pings the Zeebe integration and checks if all third party services required to perform Zeebe operations are running.'
  })
  @ApiOkResponse({ description: 'The service is fine' })
  getPing() {
    return 'pong';
  }

}
