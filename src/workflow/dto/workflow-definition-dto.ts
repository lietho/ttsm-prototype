export interface WorkflowDefinitionDto {
  id: string;
  states: Record<string, StateObject>;
  initial: string; // no parallel or compound states possible in prototype
}

export interface StateObject {
  on?: Record<string, EventObject | string>;
  external?: boolean;
  externalParticipants: ExternalParticipant[]; // ignored
  externalCondition?: ListCondition; // quite limited conditions but should suffice for prototype
  final?: boolean;
}

export interface EventObject {
  target: string;
  external?: boolean;
  schema?: object; // TODO: JSON Schema
  assign?: ObjectDefinition; // lightweight JSON Schema format, traversed, all values have to be JSON Path expressions and then assigned to context
}

export interface ExternalParticipant {
  id: string; // used for referencing participants in externalCondition and modelling the workflow
  organizationId: string; // valid values: JSON Path or UUIDv4
  workflowId: string; // valid values: JSON Path or UUIDv4
  workflowInstanceId?: string; // valid values: JSON Path or UUIDv4 or undefined
  event: string;
  payload?: ObjectDefinition;
  acceptanceSchema?: object;
  assignOnAcceptance?: ObjectDefinition;
  rejectionSchema?: object;
  assignOnRejection?: ObjectDefinition;
}

export type ObjectType = "string" | "object" | "number" | "boolean" | "array";

export interface ObjectDefinition {
  type: ObjectType;
  value?: any;
  jsonPath?: string; // depending on context, $.event and/or $.context is available
  properties?: Record<string, ObjectDefinition>;
}

export interface ListCondition {
  allOf?: string[]; // use id of external participant
  anyOf?: string[];
  min?: number;
  max?: number;
}