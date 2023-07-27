import { Module, Type } from "@nestjs/common";
import { environment } from "src/environment";
import { PersistenceStrategy } from "src/persistence/strategies";
import { OrbitDBEventLogManager } from "src/persistence/strategies/orbitdb/orbitdb-eventlog-manager";
import { OrbitDBStrategy } from "src/persistence/strategies/orbitdb/orbitdb-strategy";
import { PERSISTENCE_STRATEGY_PROVIDER_TOKEN, PersistenceService } from "./persistence.service";
import { EventStoreStrategy } from "./strategies/eventstore/event-store-strategy";

/**
 * Contains all currently supported consistency strategies.
 */
export type SupportedPersistenceStrategies = "eventstore" | "orbitdb";

const persistenceStrategy = (): Type<PersistenceStrategy> => {
  switch (environment.persistence.strategy) {
    case "eventstore":
      return EventStoreStrategy;
    case "orbitdb":
      return OrbitDBStrategy;
    default:
      return EventStoreStrategy;
  }
};

@Module({
  providers: [
    OrbitDBEventLogManager,
    PersistenceService,
    {
      provide: PERSISTENCE_STRATEGY_PROVIDER_TOKEN,
      useClass: persistenceStrategy()
    }
  ],
  exports: [
    OrbitDBEventLogManager,
    PersistenceService
  ]
})
export class PersistenceModule {
}
