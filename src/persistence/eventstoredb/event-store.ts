import { EventStoreDBClient } from '@eventstore/db-client';
import { environment } from '../../environment';

/**
 * The event store DB client.
 */
export const client = EventStoreDBClient.connectionString(environment.persistence.serviceUrl);

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
