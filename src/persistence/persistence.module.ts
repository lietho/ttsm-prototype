import { Module, Type } from "@nestjs/common";
import { environment } from "src/environment";
import { PersistenceStrategy } from "src/persistence/strategies";
import { PERSISTENCE_STRATEGY_PROVIDER_TOKEN, PersistenceService } from "./persistence.service";
import { EventStoreStrategy } from "./strategies/eventstore/event-store-strategy";

/**
 * Contains all currently supported consistency strategies.
 */
export type SupportedPersistenceStrategies = 'eventstore';

const persistenceStrategy = (): Type<PersistenceStrategy> => {
  switch (environment.persistence.strategy) {
    case 'eventstore': return EventStoreStrategy;
    default: return EventStoreStrategy;
  }
}

@Module({
  providers: [
    PersistenceService,
    {
      provide: PERSISTENCE_STRATEGY_PROVIDER_TOKEN,
      useClass: persistenceStrategy()
    }
  ],
  exports: [PersistenceService]
})
export class PersistenceModule {
}
