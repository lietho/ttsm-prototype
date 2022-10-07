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
      contractAddress: process.env.CONSISTENCY_EVM_CONTRACT_ADDRESS ?? '0xF8ff563f63559cDEcd0d422007543E34b9F5Cb38',
      clientAddress: process.env.CONSISTENCY_EVM_CLIENT_ADDRESS ?? '0x05a797C381431c9CB7513f825E01F9Ae304A0AcE'
    }
  },
  persistence: {
    serviceUrl: process.env.PERSISTENCE_SERVICE_URL ?? 'esdb://localhost:2113?tls=false'
  }
};
