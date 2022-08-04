import { ConsistencyMessage } from '../models';

/**
 * The actions message factory. Creates a new message when called and
 * holds its type.
 */
export interface ConsistencyMessageFactory<T> {
  /**
   * Creates the message with the given payload.
   * @param payload Payload.
   */
  (payload: T): ConsistencyMessage<T>;

  /**
   * Message type.
   */
  type: string;
}

/**
 * Creates a new action of the given type.
 * @param type Action type.
 */
export function createConsistencyMessage<T>(type: string): ConsistencyMessageFactory<T> {
  return Object.assign((payload: T): ConsistencyMessage<T> => ({ type, payload }), { type });
}
