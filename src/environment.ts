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
      clientAddress: process.env.CONSISTENCY_EVM_CLIENT_ADDRESS ?? '0x918811551145306c987f44f6e691ad4B526E25A9',
      contractAddress: process.env.CONSISTENCY_EVM_CONTRACT_ADDRESS ?? '0x43954e28174a595Fb1E3adf23b08b5CCE156f3dA'
    }
  },
  persistence: {
    serviceUrl: process.env.PERSISTENCE_SERVICE_URL ?? 'esdb://localhost:2113?tls=false'
  }
};
