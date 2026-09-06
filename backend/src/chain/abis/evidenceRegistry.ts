export const evidenceRegistryAbi = [
  {
    type: 'function',
    name: 'receiptOf',
    stateMutability: 'view',
    inputs: [{ name: 'dealId', type: 'bytes32' }],
    outputs: [
      {
        name: 'receipt',
        type: 'tuple',
        components: [
          { name: 'termsVersion', type: 'uint64' },
          { name: 'evidenceRevision', type: 'uint64' },
          { name: 'expiresAt', type: 'uint64' },
          { name: 'decisionCode', type: 'uint8' },
          { name: 'evidenceCommitment', type: 'bytes32' },
          { name: 'verdictCommitment', type: 'bytes32' },
          { name: 'reportId', type: 'bytes32' },
          { name: 'recordedAt', type: 'uint64' },
        ],
      },
    ],
  },
] as const;
