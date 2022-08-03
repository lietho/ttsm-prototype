import { filter, map, Observable } from 'rxjs';
import { ConsistencyMessage } from '../models';
import { ConsistencyMessageFactory } from './create-consistency-message';

/**
 * Only returns messages of the given type.
 * @param consistencyMessage The consistency message to listen to.
 */
export function ofConsistencyMessage<T>(consistencyMessage: ConsistencyMessageFactory<T>) {
  return function(source: Observable<ConsistencyMessage>): Observable<T> {
    return source.pipe(
      filter((msg) => msg?.type === consistencyMessage.type),
      map((msg) => msg.payload as T)
    );
  };
}
