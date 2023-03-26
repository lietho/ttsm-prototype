import { SupportedConsistencyStrategies } from "./consistency";
import { SupportedPersistenceStrategies } from "./persistence";

export const environment = {
  servicePort: process.env.TTSM_SERVICE_PORT ?? 3000,
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
    },
    orbitDB: {
      CONNECTION_KEEPALIVE_GRACE_PERIOD: 30000 // ms
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
    strategy: (process.env.PERSISTENCE_STRATEGY ?? 'orbitdb') as SupportedPersistenceStrategies,
    eventStore: {
      serviceUrl: process.env.PERSISTENCE_SERVICE_URL ?? 'esdb://localhost:2113?tls=false',
    },
    orbitDB: {
      localDirectory: process.env.PERSISTENCE_ORBITDB_DIRECTORY ?? 'data/orbitdb',
      id: process.env.PERSISTENCE_ORBITDB_ID ?? 'organization-a',
      ipfs: {
        port: process.env.PERSISTENCE_ORBITDB_IPFS_PORT ?? 4002,
        portWebSocket: process.env.PERSISTENCE_ORBITDB_IPFS_PORT_WS ?? 4003,
        localDirectory: process.env.PERSISTENCE_ORBITDB_IPFS_DIRECTORY ?? 'data/ipfs'
      }
    }
  },
  rules: {
    serviceUrl: process.env.RULES_SERVICE_URL ?? 'esdb://localhost:2113?tls=false'
  }
};
