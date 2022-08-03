import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { MachineConfig } from 'xstate';
import { noopOptimizer, Optimizer } from './strategies';

export type SupportedOptimizer = 'noop' | 'nakamura';

/**
 * A service that allows optimization of state charts for workflow execution.
 */
@Injectable()
export class OptimizerService {

  private readonly logger = new Logger(OptimizerService.name);
  private readonly availableOptimizer = new Map<SupportedOptimizer, Optimizer>([
    ['noop', noopOptimizer]
  ]);

  /**
   * Optimizes the given workflow model by applying the given optimizer (in order).
   * @param workflowModel Workflow model to optimize.
   * @param optimizer Name of optimizer to apply, true if all optimizers should be applied and false if none.
   */
  optimize(workflowModel: MachineConfig<any, any, any>, optimizer: SupportedOptimizer[] | boolean): MachineConfig<any, any, any> {
    // If false, no optimizers should be applied to the workflow model
    if (optimizer === false || optimizer == null) {
      return workflowModel;
    }

    // If true, all optimizers should be applied
    if (optimizer === true) {
      return Array.from(this.availableOptimizer.entries())
        .reduce((previousWorkflowModel, [optimizerName, currentOptimizer]) => {
          this.logger.log(`Apply "${optimizerName}" optimizer`);
          return currentOptimizer(previousWorkflowModel);
        }, workflowModel);
    }

    optimizer = (optimizer as SupportedOptimizer[]) ?? [];

    // An array of optimizers was specified, but it was empty. This means no optimization at all.
    if (optimizer.length <= 0) {
      return workflowModel;
    }

    // Only specific optimizers should be applied in a certain order
    return optimizer
      .map((curr) => {
        if (!this.availableOptimizer.has(curr)) {
          throw new BadRequestException(`Optimizer "${curr}" is not supported, please use one of the following: ${Array.from(this.availableOptimizer.keys()).join(', ')}`);
        }
        return [curr, this.availableOptimizer.get(curr)!] as [SupportedOptimizer, Optimizer];
      })
      .reduce((previousWorkflowModel, [optimizerName, currentOptimizer]) => {
        this.logger.log(`Apply "${optimizerName}" optimizer`);
        return currentOptimizer(previousWorkflowModel);
      }, workflowModel);
  }

}
