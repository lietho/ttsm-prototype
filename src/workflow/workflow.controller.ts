import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Workflow, WorkflowDto, WorkflowInstanceConfig, WorkflowInstanceTransitionConfig } from './models';
import { WorkflowService } from './workflow.service';
import {
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags
} from '@nestjs/swagger';
import { renameConsistencyId } from './utils';

@ApiConsumes('application/json')
@ApiProduces('application/json')
@Controller('workflows')
export class WorkflowController {

  constructor(private workflowService: WorkflowService) {
  }

  @Post()
  @ApiOperation({
    summary: 'Create a new workflow',
    description: 'Creates a new workflow with a unique ID and its corresponding state chart.'
  })
  @ApiCreatedResponse({
    description: 'Workflow has been created successfully',
    type: Workflow
  })
  @ApiTags('Workflows')
  async createWorkflow(@Body() dto: WorkflowDto) {
    return renameConsistencyId(await this.workflowService.createWorkflow(dto.workflow, dto.config));
  }

  @Get()
  @ApiOperation({
    summary: 'Get all workflows',
    description: 'Returns a list of all previously created workflows (no matter if still active or not).'
  })
  @ApiOkResponse({
    description: 'Workflows returned successfully',
    type: [Workflow]
  })
  @ApiTags('Workflows')
  async getAllWorkflows() {
    const workflows = await this.workflowService.getWorkflows();
    return workflows.map((entity) => renameConsistencyId(entity));
  }

  @Post(':id/launch')
  @ApiOperation({
    summary: 'Launch workflow instance',
    description: 'Launches a new instance of a previously created workflow.'
  })
  @ApiParam({
    name: 'id',
    example: '44aece41-d6cb-466b-95e4-2d59cf5b2f01',
    description: 'The ID of the workflow of which a new instance should be launched.'
  })
  @ApiOkResponse({
    description: 'Workflow instance has been launched successfully'
  })
  @ApiTags('Workflow Instances')
  async launchWorkflowInstance(@Param('id') workflowId: string,
                               @Body() instanceConfig?: WorkflowInstanceConfig) {
    return renameConsistencyId(await this.workflowService.launchWorkflowInstance(workflowId, instanceConfig));
  }

  @Post(':workflowId/instances/:instanceId/advance')
  @ApiOperation({
    summary: 'Advance workflow instance',
    description: 'Advances the instance with the given ID of the workflow with the given ID to the next state using the given transition event.'
  })
  @ApiParam({
    name: 'workflowId',
    example: '44aece41-d6cb-466b-95e4-2d59cf5b2f01',
    description: 'The ID of the workflow.'
  })
  @ApiParam({
    name: 'instanceId',
    example: 'eee0dc00-486e-48c7-9d40-3df957a28ac2',
    description: 'The ID of the instance of a given workflow that should be advanced.'
  })
  @ApiTags('Workflow Instances')
  async advanceWorkflowInstance(@Param('workflowId') workflowId: string,
                                @Param('instanceId') instanceId: string,
                                @Body() transitionConfig: WorkflowInstanceTransitionConfig) {
    return renameConsistencyId(await this.workflowService.advanceWorkflowInstance(workflowId, instanceId, transitionConfig));
  }
}
