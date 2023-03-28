import { EventStoreDBClient } from '@eventstore/db-client';
import { environment } from "src/environment";

/**
 * The event store DB client.
 */
export const client = EventStoreDBClient.connectionString(environment.persistence.eventStore.serviceUrl);

/**
 * Establishes a connection to the event store DB itself.
 */
export const connect = () => {
  return client.readAll({
    direction: 'forwards',
    fromPosition: 'start',
    maxCount: 1
  });
};
