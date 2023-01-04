import { PersistenceEvent, PersistenceEventFactory } from "./create-persistence-event";

export function handleEvent<T>(eventFactory: PersistenceEventFactory<T>, event: PersistenceEvent<unknown>, callback: (event: PersistenceEvent<T>) => void) {
  const eventType = event?.type;

  if (eventFactory.sameAs(eventType)) {
    callback(event as PersistenceEvent<T>);
  }
}