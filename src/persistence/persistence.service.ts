import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { jsonEvent, MetadataType } from '@eventstore/db-client';
import { client as eventStore, connect as connectToEventStore } from './eventstoredb';
import { environment } from '../environment';

/**
 * Adapter service for third party event sourcing services.
 */
@Injectable()
export class PersistenceService implements OnModuleInit {

  private readonly logger = new Logger(PersistenceService.name);

  /** @inheritDoc */
  onModuleInit() {
    this.logger.log(`Establishing connection to event store on "${environment.persistenceServiceUrl}"`);
    connectToEventStore();
  }

  /**
   * Appends a single event to the stream with the given name.
   * @param streamName Stream name.
   * @param event Event data.
   */
  async appendToStream(streamName: string, event: { type: string, data: any, metadata?: MetadataType }) {
    this.logger.debug(`Write to stream "${streamName}": ${JSON.stringify(event)}`);
    return await eventStore.appendToStream(streamName, jsonEvent(event));
  }

  /**
   * Reads all events from all streams.
   */
  async readAll() {
    this.logger.debug(`Read all events from all streams`);
    return eventStore.readAll({
      direction: 'forwards',
      fromPosition: 'start',
      maxCount: 1000
    });
  }

  /**
   * Reads all events from the stream with the given name.
   * @param streamName Stream name.
   */
  async readStream(streamName: string) {
    this.logger.debug(`Read all events from stream "${streamName}"`);
    return eventStore.readStream(streamName, {
      direction: 'forwards',
      fromRevision: 'start',
      maxCount: 1000
    });
  }

  /**
   * Reads all events backwards from the stream with the given name. Reading backwards
   * means that the events are traversed from the end of the stream towards the beginning.
   * @param streamName Stream name.
   */
  async readStreamBackwards(streamName: string) {
    this.logger.debug(`Read all events backwards from stream "${streamName}"`);
    return eventStore.readStream(streamName, {
      direction: 'backwards',
      fromRevision: 'end',
      maxCount: 1000
    });
  }

}
