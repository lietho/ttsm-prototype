/**
 * The application binary interface for the EVM strategy.
 */
export const EvmStrategyAbi = [
  {
    'anonymous': false,
    'inputs': [
      {
        'indexed': false,
        'internalType': 'bytes32',
        'name': 'hash',
        'type': 'bytes32'
      }
    ],
    'name': 'StoreHash',
    'type': 'event'
  },
  {
    'inputs': [
      {
        'internalType': 'bytes32',
        'name': 'hash',
        'type': 'bytes32'
      }
    ],
    'name': 'store',
    'outputs': [],
    'stateMutability': 'nonpayable',
    'type': 'function'
  }
];
