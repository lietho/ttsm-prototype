/**
 * Consistency entities are used to uniquely identify entities across participants.
 */
export interface ConsistencyEntity {

  /**
   * This is the only ID that MUST be the same on every participants side.
   */
  consistencyId: string;
}
