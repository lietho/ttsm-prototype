import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { RegisterRuleService } from './models';
import { RulesService } from './rules.service';

@Controller('rules')
@ApiTags('Rules')
export class RulesController {

  constructor(private rulesService: RulesService) {
  }

  @Post('register')
  @ApiOperation({
    summary: 'Register rule service',
    description: 'Registers a new rule service with the given name and a callback URL.'
  })
  @ApiOkResponse({
    description: 'Rule service has been registered successfully'
  })
  async registerRuleService(@Body() ruleService: RegisterRuleService) {
    return await this.rulesService.registerRuleService(ruleService.name, ruleService.url);
  }

  @Delete('unregister/:id')
  @ApiOperation({
    summary: 'Unregister rule service',
    description: 'Removes the rule service with the given name from the callback registry. If no rule service with the given ID exists, an error will be returned.'
  })
  @ApiParam({
    name: 'id',
    example: '570303f0-20f1-42f4-ba17-b59f73d74d09',
    description: 'The ID of the rule service.'
  })
  @ApiNotFoundResponse({
    description: 'Rule service with the given ID does not exist'
  })
  @ApiOkResponse({
    description: 'Rule service has been unregistered successfully'
  })
  async unregisterRuleService(@Param('id') name: string) {
    await this.rulesService.unregisterRuleService(name);
    return 'OK';
  }

  @Get()
  @ApiOperation({
    summary: 'Get all rule services',
    description: 'Returns all currently registered rule services.'
  })
  @ApiOkResponse({
    description: 'Rule services returned successfully'
  })
  async getRegisteredRuleServices() {
    return await this.rulesService.getAllRegisteredRuleServices();
  }

}
