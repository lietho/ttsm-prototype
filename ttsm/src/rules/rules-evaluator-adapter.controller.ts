import { Body, Controller, Inject, Logger, Post } from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { RuleServiceResponse } from './models';
import { WorkflowProposal } from 'src/workflow/models/workflow';
import { WorkflowInstanceProposal } from 'src/workflow/models/workflow-instance';
import { WorkflowInstanceTransition } from 'src/workflow/models/workflow-instance-transition';
import { EvaluationRequest, RulesControllerApi } from './rules-evaluator-client';
import { ConsistencyStrategy } from 'src/consistency/strategies';
import { CONSISTENCY_STRATEGY_PROVIDER_TOKEN } from 'src/consistency';

@Controller('rulesEvaluator')
@ApiTags('RulesEvaluator')
@ApiConsumes('application/json')
@ApiProduces('application/json')
export class RulesEvaluatorAdapterController {
  private readonly logger = new Logger(RulesEvaluatorAdapterController.name);

  constructor(
    private rulesControllerApi: RulesControllerApi
    ) {
  }

  @Post('check-new-workflow')
  @ApiOperation({
    summary: 'Validates a workflow proposal.',
    description: 'Validates the workflow proposal against the predefined rules.'
  })
  checkNewWorkflow(@Body() proposal: WorkflowProposal): RuleServiceResponse {
    this.logger.log("Received new workflow proposal: " + proposal);

    return { valid: true, reason: undefined };
  }

  @Post('check-new-instance')
  @ApiOperation({
    summary: 'Validates a workflow instance proposal.',
    description: 'Validates the workflow instance proposal against the predefined rules.'
  })
  checkNewInstance(@Body() proposal: WorkflowInstanceProposal): RuleServiceResponse {
    this.logger.log("Received new workflow instance proposal: " + proposal);

    return { valid: true, reason: undefined };
  }

  @Post('check-state-transition')
  @ApiOperation({
    summary: 'Validates a workflow state transition.',
    description: 'Validates the workflow state transition against the predefined rules.'
  })
  async checkStateTransition(@Body() transition: WorkflowInstanceTransition): Promise<RuleServiceResponse> {
    this.logger.log("Received new workflow state transition: " + transition);

    try {
      await this.rulesControllerApi.evaluate(this.mapModels(transition));

      return { valid: true, reason: undefined };
    } catch (error) {
      this.logger.error(error);
      return { valid: false, reason: error };
    }
  }

  mapModels(transition: WorkflowInstanceTransition): EvaluationRequest {
    return {
      rules: [],
      newProcessState: transition.to,
      environmentState: {},
      delta: {
        content: transition.payload,
        sender: transition.organizationId,
        signers: [transition.organizationId]
      },
      currentTime: transition.commitment?.timestamp ?? new Date()
    }
  }

}
