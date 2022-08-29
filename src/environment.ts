export const environment = {
  servicePort: 3000,
  consistencyServiceUrl: process.env.CONSISTENCY_SERVICE_URL ?? 'http://localhost:3001',
  persistenceServiceUrl: process.env.PERSISTENCE_SERVICE_URL ?? 'esdb://localhost:2113?tls=false'
};
