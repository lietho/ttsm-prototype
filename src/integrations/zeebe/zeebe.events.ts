import { createPersistenceEvent } from '../../persistence';
import { WorkflowInstanceProposal, WorkflowProposal } from '../../workflow';
import { CreateProcessInstanceResponse, ProcessMetadata } from 'zeebe-node';

export type ZeebeProcessMetadata = ProcessMetadata;
export type ZeebeProcessInstance = CreateProcessInstanceResponse;

export const zeebeDeployedProcess = createPersistenceEvent<{ key: string, definition: WorkflowProposal, processes: ZeebeProcessMetadata[] }>('Zeebe.Process.Deployed');
export const zeebeCreatedProcessInstance = createPersistenceEvent<{ definition: WorkflowInstanceProposal, instance: ZeebeProcessInstance }>('Zeebe.Process.Created');
