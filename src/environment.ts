import { SupportedPersistenceStrategies } from "./persistence";
import { SupportedConsistencyStrategies } from './consistency';

export const environment = {
  servicePort: 3000,
  consistency: {
    strategy: (process.env.CONSISTENCY_STRATEGY ?? 'noop') as SupportedConsistencyStrategies,
    p2p: {
      peerUrls: (process.env.CONSISTENCY_P2P_PEER_URLS?.split(' ')) ?? ['http://localhost:3001']
    },
    evm: {
      peerUrls: (process.env.CONSISTENCY_EVM_PEER_URLS?.split(' ')) ?? ['http://localhost:3001'],
      provider: process.env.CONSISTENCY_EVM_PROVIDER ?? 'ws://localhost:7545',
      clientAddress: process.env.CONSISTENCY_EVM_CLIENT_ADDRESS ?? '0xAA2255232E747342DA4EE3C32015361809d9e5b0',
      contractAddress: process.env.CONSISTENCY_EVM_CONTRACT_ADDRESS ?? '0xd11E5f19B7f00Af7706af7b41B794Fd58c0e5C6B'
    }
  },
  integrations: {
    zeebe: {
      gatewayAddress: process.env.INTEGRATIONS_ZEEBE_ADDRESS ?? '',
      authorizationServerUrl: process.env.INTEGRATIONS_ZEEBE_AUTHORIZATION_SERVER_URL ?? 'https://login.cloud.camunda.io/oauth/token',
      audience: process.env.INTEGRATIONS_ZEEBE_AUDIENCE ?? '',
      clientId: process.env.INTEGRATIONS_ZEEBE_CLIENT_ID ?? '',
      clientSecret: process.env.INTEGRATIONS_ZEEBE_CLIENT_SECRET ?? ''
    }
  },
  persistence: {
    strategy: (process.env.PERSISTENCE_STRATEGY ?? 'eventstore') as SupportedPersistenceStrategies,
    eventStore: {
      serviceUrl: process.env.PERSISTENCE_SERVICE_URL ?? 'esdb://localhost:2113?tls=false',
    }
  },
  rules: {
    serviceUrl: process.env.RULES_SERVICE_URL ?? 'esdb://localhost:2113?tls=false'
  }
};
