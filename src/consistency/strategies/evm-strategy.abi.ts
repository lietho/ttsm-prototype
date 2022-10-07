/**
 * The application binary interface for the EVM strategy.
 */
export const EvmStrategyAbi = [
  {
    'inputs': [],
    'name': 'retrieve',
    'outputs': [
      {
        'internalType': 'bytes32[]',
        'name': '',
        'type': 'bytes32[]'
      }
    ],
    'stateMutability': 'view',
    'type': 'function'
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
