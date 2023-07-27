import { ConsistencyEntity } from '../../consistency';

export const renameConsistencyId = <T extends ConsistencyEntity>(entity: T): Omit<T, 'consistencyId'> & { id: string } => {
  const result = { id: entity.consistencyId, ...entity };
  delete result.consistencyId;
  return result;
};
