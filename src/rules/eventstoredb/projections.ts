import { randomUUIDv4 } from "src/core/utils";
import * as ruleEventTypes from "src/rules/rules.events";

export const RULE_SERVICES_PROJECTION_NAME = 'custom-projections.rules.' + randomUUIDv4();
export const RULE_SERVICES_PROJECTION = `
    fromAll()
        .when({
            $init: () => ({ services: {} }),
            "${ruleEventTypes.registerRuleService.type}": (s, e) => { s.services[e.data.id] = e.data; },
            "${ruleEventTypes.unregisterRuleService.type}": (s, e) => { delete s.services[e.data.id]; },
        })
        .transformBy((state) => state.services)
        .outputState();
  `;