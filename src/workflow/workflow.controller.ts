import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { WorkflowDto, WorkflowInstanceDto, WorkflowInstanceTransitionDto } from './models';
import { WorkflowService } from './workflow.service';
import { ApiConsumes, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiProduces, ApiQuery, ApiTags } from '@nestjs/swagger';
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
    description: 'Workflow has been created successfully'
  })
  @ApiTags('Workflows')
  async createWorkflow(@Body() dto: WorkflowDto) {
    return renameConsistencyId(await this.workflowService.proposeWorkflow(dto.workflow, dto.config));
  }

  @Get()
  @ApiOperation({
    summary: 'Get all workflows',
    description: 'Returns a list of all previously created workflows (no matter if still active or not).'
  })
  @ApiOkResponse({
    description: 'Workflows returned successfully'
  })
  @ApiTags('Workflows')
  async getAllWorkflows() {
    const workflows = await this.workflowService.getWorkflows();
    return workflows.map((entity) => renameConsistencyId(entity));
  }

  @Get(':workflowId')
  @ApiOperation({
    summary: 'Get workflow',
    description: 'Returns the workflow with the given ID.'
  })
  @ApiParam({
    name: 'workflowId',
    example: '44aece41-d6cb-466b-95e4-2d59cf5b2f01',
    description: 'The ID of the workflow.'
  })
  @ApiQuery({
    name: 'until',
    example: '2022-08-04T12:37:54.097Z',
    description: 'Enables time-travel by specifying the point in time to which the system should query back and return the workflow definition.',
    required: false
  })
  @ApiOkResponse({
    description: 'Workflows returned successfully'
  })
  @ApiNotFoundResponse({
    description: 'The workflow with the given ID does not exist'
  })
  @ApiTags('Workflows', 'Time Travel')
  async getWorkflow(@Param('workflowId') workflowId: string,
                    @Query('until') timestamp?: string) {
    const until = new Date(timestamp);
    if (!isNaN(until.getTime())) {
      return renameConsistencyId(await this.workflowService.getWorkflowStateAt(workflowId, until));
    }
    return renameConsistencyId(await this.workflowService.getWorkflow(workflowId));
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
  @ApiNotFoundResponse({
    description: 'The workflow with the given ID does not exist'
  })
  @ApiTags('Workflow Instances')
  async launchWorkflowInstance(@Param('id') workflowId: string,
                               @Body() instanceConfig?: WorkflowInstanceDto) {
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
  @ApiNotFoundResponse({
    description: 'The workflow or the workflow instance with the given ID do not exist'
  })
  @ApiTags('Workflow Instances')
  async advanceWorkflowInstance(@Param('workflowId') workflowId: string,
                                @Param('instanceId') instanceId: string,
                                @Body() transitionConfig: WorkflowInstanceTransitionDto) {
    return renameConsistencyId(await this.workflowService.advanceWorkflowInstance(workflowId, instanceId, transitionConfig));
  }

  @Get(':workflowId/instances/:instanceId')
  @ApiOperation({
    summary: 'Get workflow instance',
    description: 'Returns the workflow instance with the given ID.'
  })
  @ApiParam({
    name: 'workflowId',
    example: '44aece41-d6cb-466b-95e4-2d59cf5b2f01',
    description: 'The ID of the workflow.'
  })
  @ApiParam({
    name: 'instanceId',
    example: 'eee0dc00-486e-48c7-9d40-3df957a28ac2',
    description: 'The ID of the instance of a given workflow that should be returned.'
  })
  @ApiQuery({
    name: 'until',
    example: '2022-08-04T12:37:54.097Z',
    description: 'Enables time-travel by specifying the point in time to which the system should query back and return the workflow instance.',
    required: false
  })
  @ApiOkResponse({
    description: 'Workflow instance returned successfully'
  })
  @ApiNotFoundResponse({
    description: 'The workflow or the workflow instance with the given ID do not exist'
  })
  @ApiTags('Workflow Instances', 'Time Travel')
  async getWorkflowInstance(@Param('workflowId') workflowId: string,
                            @Param('instanceId') instanceId: string,
                            @Query('until') timestamp?: string) {
    const until = new Date(timestamp);
    if (!isNaN(until.getTime())) {
      return renameConsistencyId(await this.workflowService.getWorkflowInstanceStateAt(instanceId, until));
    }
    return renameConsistencyId(await this.workflowService.getWorkflowInstance(workflowId, instanceId));
  }

  @Get(':workflowId/instances/:instanceId/payloads')
  @ApiOperation({
    summary: 'Get workflow instance payloads',
    description: 'Returns all ever attached state transition (advancement) payloads of the workflow instance with the given ID.'
  })
  @ApiParam({
    name: 'workflowId',
    example: '44aece41-d6cb-466b-95e4-2d59cf5b2f01',
    description: 'The ID of the workflow.'
  })
  @ApiParam({
    name: 'instanceId',
    example: 'eee0dc00-486e-48c7-9d40-3df957a28ac2',
    description: 'The ID of the instance of a given workflow for which the state transition payloads should be returned.'
  })
  @ApiQuery({
    name: 'until',
    example: '2022-08-04T12:37:54.097Z',
    description: 'Enables time-travel by specifying the point in time to which the system should query back.',
    required: false
  })
  @ApiOkResponse({
    description: 'Workflow instance payloads returned successfully'
  })
  @ApiNotFoundResponse({
    description: 'The workflow instance with the given ID does not exist'
  })
  @ApiTags('Workflow Instances', 'Time Travel')
  async getWorkflowInstanceStateTransitionPayloadsUntil(@Param('workflowId') workflowId: string,
                                                        @Param('instanceId') instanceId: string,
                                                        @Query('until') timestamp?: string) {
    const until = new Date(timestamp ?? Date.now());
    return await this.workflowService.getWorkflowInstanceStateTransitionPayloadsUntil(instanceId, until);
  }

  @Get(':workflowId/instances')
  @ApiOperation({
    summary: 'Get workflow instances',
    description: 'Returns all workflow instances of the workflow with the given ID.'
  })
  @ApiParam({
    name: 'workflowId',
    example: '44aece41-d6cb-466b-95e4-2d59cf5b2f01',
    description: 'The ID of the workflow.'
  })
  @ApiOkResponse({
    description: 'All workflow instances returned successfully'
  })
  @ApiNotFoundResponse({
    description: 'The workflow with the given ID does not exist'
  })
  @ApiTags('Workflow Instances')
  async getWorkflowInstancesOfWorkflow(@Param('workflowId') workflowId: string) {
    const result = await this.workflowService.getWorkflowInstancesOfWorkflow(workflowId);
    return result.map((curr) => renameConsistencyId(curr));
  }
}
