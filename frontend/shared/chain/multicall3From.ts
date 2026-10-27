import { parseAbi } from 'viem';

/// Arc's predeployed batcher, on testnet and mainnet (docs.arc.io, batched
/// transactions). Each call inside keeps the signing wallet as the sender.
export const MULTICALL3FROM = '0x522fAf9A91c41c443c66765030741e4AaCe147D0' as const;

export const multicall3FromAbi = parseAbi([
  'struct Call3 { address target; bool allowFailure; bytes callData; }',
  'struct Result { bool success; bytes returnData; }',
  'function aggregate3(Call3[] calls) returns (Result[])',
]);
