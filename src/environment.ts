import { SupportedConsistencyStrategies } from './consistency';

export const environment = {
  servicePort: 3000,
  consistency: {
    strategy: (process.env.CONSISTENCY_STRATEGY ?? 'evm') as SupportedConsistencyStrategies,
    p2p: {
      peerUrls: (process.env.CONSISTENCY_P2P_PEER_URLS?.split(' ')) ?? ['http://localhost:3001']
    },
    evm: {
      peerUrls: (process.env.CONSISTENCY_EVM_PEER_URLS?.split(' ')) ?? ['http://localhost:3001'],
      provider: process.env.CONSISTENCY_EVM_PROVIDER ?? 'ws://localhost:7545',
      clientAddress: process.env.CONSISTENCY_EVM_CLIENT_ADDRESS ?? '0x17212776520A70a69a0752e47AED0bA9aE965514',
      contractAddress: process.env.CONSISTENCY_EVM_CONTRACT_ADDRESS ?? '0xcd912f8f44D792d757B476bee28ed991fae4c647'
    }
  },
  persistence: {
    serviceUrl: process.env.PERSISTENCE_SERVICE_URL ?? 'esdb://localhost:2113?tls=false'
  }
};
