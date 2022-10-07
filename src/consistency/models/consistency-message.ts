/**
 * A single message used by the consistency layer.
 */
export interface ConsistencyMessage<T> {

  /**
   * Payload (any kind of data).
   */
  payload: T;

  /**
   * Indicates what kind of message this is (might also hold information about the payload!).
   */
  type: string;

  /**
   * Commitment reference
   */
  commitmentReference?: string | any;
}
