import { createPersistenceEvent } from '../persistence/utils';
import { RuleService } from './models';

// Rules module commands
export const registerRuleService = createPersistenceEvent<RuleService>('RegisterRuleService');
export const unregisterRuleService = createPersistenceEvent<{ id: string }>('UnregisterRuleService');
