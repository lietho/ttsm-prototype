import { Subject } from "rxjs";
import { ConsistencyMessage } from "../models";

export type Status = "OK" | "NOK";

/**
 * Consistency strategies are used to enable consistency of dispatched data through out all
 * participants. Different implementations might use different kinds of backend services to
 * ensure consistency.
 */
export interface ConsistencyStrategy {

  /**
   * Emits all messages dispatched by either this or other parties. Subsequent filtering of events
   * is required.
   * @see ofActionType
   */
  readonly actions$: Subject<ConsistencyMessage<unknown>>;

  /**
   * Returns the current status of the service stack that is required to run this strategy or throws an
   * error if the stack is currently unreachable or times out.
   * @throws GatewayTimeoutException When the required backend services are not reachable.
   */
  getStatus(): Promise<Status>;

  /**
   * Dispatches a given message and ensures its consistency.
   * @param msg Action with any type of JSON structure as payload.
   * @throws GatewayTimeoutException When the required backend services are not reachable.
   */
  dispatch<T>(msg: ConsistencyMessage<T>): Promise<Status>;

  getOrganizationIdentifier(): string;
}
