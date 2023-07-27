/**
 * A persistence event.
 */
export type PersistenceEvent<T> = { type: string, data: T, created: number };

/**
 * The persistence event factory creates a new event when called and holds its type.
 */
export interface PersistenceEventFactory<T> {

  /**
   * Creates the persistence event with a given data payload.
   * @param data Data.
   */
  (data: T): PersistenceEvent<T>;

  /**
   * Returns true if this event type and the given one are the same. Either accepts a {@link PersistenceEvent} or
   * a plain string as event name.
   * @param eventType Persistence event type.
   */
  sameAs: <S>(eventType: PersistenceEvent<S> | string) => boolean;

  /**
   * Persistence event type.
   */
  type: string;
}

/**
 * Creates a new persistence event of the given type.
 * @param type Persistence event type.
 */
export function createPersistenceEvent<T>(type: string): PersistenceEventFactory<T> {
  return Object.assign(
    (data: T): PersistenceEvent<T> => ({ type, data, created: new Date().getTime() }), {
    type,
    sameAs: <S>(eventType: PersistenceEvent<S> | string) => (eventType as PersistenceEvent<S>)?.type === type || (eventType as string) === type
  });
}
