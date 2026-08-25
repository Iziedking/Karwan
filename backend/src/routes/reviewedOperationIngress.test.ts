import assert from 'node:assert/strict';
import test from 'node:test';

process.env.ADMIN_API_TOKEN = 'phase3c-admin-test-token';

const {
  configureReviewedNegotiationIngress,
  configureReviewedEvidenceIngress,
  configureReviewedEvidenceReconciliationIngress,
  configureReviewedFinancialOperationIngress,
  configureStakeQualificationShadowIngress,
  configureStakeFundingResumeIngress,
  configureStakeFinancialOperationIngress,
  configureStakeApprovalResumeIngress,
  configureReengagementIngress,
  reviewedOperationIngressRoutes,
} = await import('./reviewedOperationIngress.js');

const headers = {
  'x-admin-token': 'phase3c-admin-test-token',
  'content-type': 'application/json',
};

const body = {
  dealRoomId: 'room-admin-ingress', source: 'manual-review', commandId: 'command-admin-ingress',
  idempotencyKey: 'negotiation-operation:admin-ingress', expectedDealRoomVersion: 1,
  rawOffer: {
    dealRoomId: 'room-admin-ingress', offerId: 'offer-admin-ingress', offerVersion: 1,
    senderRole: 'buyer', recipientRole: 'seller', kind: 'OPENING', action: 'REVISE_PRICE',
    priceUsdc: '10', deadlineUnix: 2_000, buyerMandateVersion: 1, sellerMandateVersion: 1,
    terms: { scope: 'review', delivery: '24 hours', paymentTerms: 'after acceptance' },
  },
  mandates: { buyerMaxPriceUsdc: '20', sellerMinPriceUsdc: '5', buyerMandateVersion: 1, sellerMandateVersion: 1 },
  attempt: { id: 'attempt-admin-ingress', attemptNumber: 1, trigger: 'USER_REQUESTED', triggerReference: 'admin-1', strategy: {} },
  observedAtUnix: 100,
};

test('reviewed negotiation ingress fails closed until explicitly configured', async () => {
  const response = await reviewedOperationIngressRoutes.request('/negotiation', {
    method: 'POST', headers, body: JSON.stringify(body),
  });
  assert.equal(response.status, 503);
  const unauthenticated = await reviewedOperationIngressRoutes.request('/negotiation', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal(unauthenticated.status, 401);
  const evidenceDisabled = await reviewedOperationIngressRoutes.request('/evidence', {
    method: 'POST', headers, body: JSON.stringify({ nope: true }),
  });
  assert.equal(evidenceDisabled.status, 503);
  const evidenceReconciliationDisabled = await reviewedOperationIngressRoutes.request('/evidence-reconciliation', {
    method: 'POST', headers, body: JSON.stringify({ nope: true }),
  });
  assert.equal(evidenceReconciliationDisabled.status, 503);
  const financialDisabled = await reviewedOperationIngressRoutes.request('/financial-shadow', {
    method: 'POST', headers, body: JSON.stringify({ nope: true }),
  });
  assert.equal(financialDisabled.status, 503);
  const operationDisabled = await reviewedOperationIngressRoutes.request('/financial-operation', {
    method: 'POST', headers, body: JSON.stringify({ nope: true }),
  });
  assert.equal(operationDisabled.status, 503);
  const stakeOperationDisabled = await reviewedOperationIngressRoutes.request('/staking-operation', {
    method: 'POST', headers, body: JSON.stringify({ nope: true }),
  });
  assert.equal(stakeOperationDisabled.status, 503);
  const stakeResumeDisabled = await reviewedOperationIngressRoutes.request('/staking-operation-resume', {
    method: 'POST', headers, body: JSON.stringify({ nope: true }),
  });
  assert.equal(stakeResumeDisabled.status, 503);
  const stakingDisabled = await reviewedOperationIngressRoutes.request('/staking-shadow', {
    method: 'POST', headers, body: JSON.stringify({ nope: true }),
  });
  assert.equal(stakingDisabled.status, 503);
  const fundingDisabled = await reviewedOperationIngressRoutes.request('/staking-funding-shadow', {
    method: 'POST', headers, body: JSON.stringify({ nope: true }),
  });
  assert.equal(fundingDisabled.status, 503);
  const reengagementDisabled = await reviewedOperationIngressRoutes.request('/reengagement', {
    method: 'POST', headers, body: JSON.stringify({ nope: true }),
  });
  assert.equal(reengagementDisabled.status, 503);
});

test('reviewed negotiation ingress enqueues only through the configured observer', async () => {
  const observed: unknown[] = [];
  const dispose = configureReviewedNegotiationIngress(async (data) => {
    observed.push(data);
    return { created: observed.length === 1 };
  });
  try {
    const response = await reviewedOperationIngressRoutes.request('/negotiation', {
      method: 'POST', headers, body: JSON.stringify(body),
    });
    assert.equal(response.status, 202);
    assert.equal((await response.json()).taskKind, 'negotiation.turn.operation');
    const duplicate = await reviewedOperationIngressRoutes.request('/negotiation', {
      method: 'POST', headers, body: JSON.stringify(body),
    });
    assert.equal(duplicate.status, 200);
    assert.equal(observed.length, 2);
    const invalid = await reviewedOperationIngressRoutes.request('/negotiation', {
      method: 'POST', headers, body: JSON.stringify({ nope: true }),
    });
    assert.equal(invalid.status, 400);
  } finally {
    dispose();
  }
});

test('reviewed re-engagement ingress applies strict policy and idempotent enqueue semantics', async () => {
  const observed: unknown[] = [];
  const dispose = configureReengagementIngress(async (data) => {
    observed.push(data);
    return {
      decision: { outcome: 'schedule' },
      created: observed.length === 1,
    };
  });
  const reengagementBody = {
    dealRoomId: 'room-reengagement-admin-ingress',
    trigger: 'USER_REQUESTED',
    triggerReference: 'user-request-1',
    nowUnix: 100,
    attemptCount: 0,
    maxAttempts: 3,
    currentFingerprint: 'fingerprint-1',
    data: { source: 'admin-review' },
  };
  try {
    const response = await reviewedOperationIngressRoutes.request('/reengagement', {
      method: 'POST', headers, body: JSON.stringify(reengagementBody),
    });
    assert.equal(response.status, 202);
    const responseBody = await response.json() as {
      taskKind: string;
      created: boolean;
      providerWritesAuthorized: boolean;
      financialMutationsAuthorized: boolean;
    };
    assert.equal(responseBody.taskKind, 'deal_room.reengage');
    assert.equal(responseBody.created, true);
    assert.equal(responseBody.providerWritesAuthorized, false);
    assert.equal(responseBody.financialMutationsAuthorized, false);
    const duplicate = await reviewedOperationIngressRoutes.request('/reengagement', {
      method: 'POST', headers, body: JSON.stringify(reengagementBody),
    });
    assert.equal(duplicate.status, 200);
    assert.equal((await duplicate.json()).created, false);
    assert.equal(observed.length, 2);
    const invalid = await reviewedOperationIngressRoutes.request('/reengagement', {
      method: 'POST', headers, body: JSON.stringify({ ...reengagementBody, unknown: true }),
    });
    assert.equal(invalid.status, 400);
  } finally {
    dispose();
  }
});

test('reviewed negotiation ingress distinguishes persistence failure from malformed input', async () => {
  const dispose = configureReviewedNegotiationIngress(async () => {
    throw new Error('simulated database outage');
  });
  try {
    const response = await reviewedOperationIngressRoutes.request('/negotiation', {
      method: 'POST', headers, body: JSON.stringify(body),
    });
    assert.equal(response.status, 500);
    assert.equal((await response.json()).error, 'reviewed negotiation enqueue failed');
  } finally {
    dispose();
  }
});

test('reviewed evidence ingress is strict, idempotent, and adapter-free at the route boundary', async () => {
  const observed: unknown[] = [];
  const dispose = configureReviewedEvidenceIngress(async (data) => {
    observed.push(data);
    return { created: observed.length === 1 };
  });
  const evidenceBody = {
    dealRoomId: 'room-evidence-admin-ingress',
    source: 'manual-review',
    idempotencyKey: 'evidence-admin-ingress-1',
    planner: {
      need: {
        needId: 'need-admin-ingress-1', claim: 'completed-transactions', subject: '0x1111111111111111111111111111111111111111',
        decision: 'qualification', requiredFreshnessSeconds: 3_600, minimumReliability: 70,
        maximumPriceUsdc: '2', mandateVersion: 1, policyVersion: 'policy-1', expiresAtUnix: 1_000,
      },
      nowUnix: 100, cachedSnapshots: [], providers: [], expectedDecisionValueUsdc: '5',
      perDealSpentUsdc: '0', perDealBudgetUsdc: '1', allowedNetworks: [], allowedAssets: [],
      allowedPayTo: [], requiredProvenance: [],
    },
  };
  try {
    const response = await reviewedOperationIngressRoutes.request('/evidence', {
      method: 'POST', headers, body: JSON.stringify(evidenceBody),
    });
    assert.equal(response.status, 202);
    const responseBody = await response.json() as { taskKind: string; evidenceProviderCallsAuthorized: boolean };
    assert.equal(responseBody.taskKind, 'evidence.acquisition.operation');
    assert.equal(responseBody.evidenceProviderCallsAuthorized, false);
    const duplicate = await reviewedOperationIngressRoutes.request('/evidence', {
      method: 'POST', headers, body: JSON.stringify(evidenceBody),
    });
    assert.equal(duplicate.status, 200);
    assert.equal(observed.length, 2);
    const invalid = await reviewedOperationIngressRoutes.request('/evidence', {
      method: 'POST', headers, body: JSON.stringify({ nope: true }),
    });
    assert.equal(invalid.status, 400);
  } finally {
    dispose();
  }
});

test('reviewed evidence reconciliation ingress is strict, idempotent, and non-mutating', async () => {
  const observed: unknown[] = [];
  const dispose = configureReviewedEvidenceReconciliationIngress(async (data) => {
    observed.push(data);
    return { created: observed.length === 1 };
  });
  const body = {
    dealRoomId: 'room-evidence-reconcile-ingress',
    purchaseId: 'purchase-evidence-reconcile-ingress',
    expectedPurchaseVersion: 2,
    observationKey: 'provider-tx-1:settled:1',
    observedAtUnix: 100,
    source: 'provider-webhook',
    verificationReference: 'webhook:provider-tx-1:1',
    state: 'settled',
    providerTransactionId: 'provider-tx-1',
    txHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    snapshot: {
      snapshotId: 'snapshot-evidence-reconcile-ingress',
      source: 'x402', capturedAtUnix: 99, reliability: 90, status: 'fresh',
      responseHash: 'sha256:evidence-reconcile-ingress', provenance: ['provider-tx-1'],
    },
  };
  try {
    const response = await reviewedOperationIngressRoutes.request('/evidence-reconciliation', {
      method: 'POST', headers, body: JSON.stringify(body),
    });
    assert.equal(response.status, 202);
    const responseBody = await response.json() as {
      taskKind: string;
      providerWritesAuthorized: boolean;
      evidenceProviderCallsAuthorized: boolean;
      financialMutationsAuthorized: boolean;
    };
    assert.equal(responseBody.taskKind, 'evidence.reconcile.operation');
    assert.equal(responseBody.providerWritesAuthorized, false);
    assert.equal(responseBody.evidenceProviderCallsAuthorized, false);
    assert.equal(responseBody.financialMutationsAuthorized, false);
    const duplicate = await reviewedOperationIngressRoutes.request('/evidence-reconciliation', {
      method: 'POST', headers, body: JSON.stringify(body),
    });
    assert.equal(duplicate.status, 200);
    assert.equal(observed.length, 2);
    const invalid = await reviewedOperationIngressRoutes.request('/evidence-reconciliation', {
      method: 'POST', headers, body: JSON.stringify({ ...body, unknown: true }),
    });
    assert.equal(invalid.status, 400);
  } finally {
    dispose();
  }
});

test('financial shadow ingress is strict, idempotent, and explicitly non-mutating', async () => {
  const observed: unknown[] = [];
  const dispose = await import('./reviewedOperationIngress.js').then(({ configureFinancialShadowIngress }) =>
    configureFinancialShadowIngress(async (data) => {
      observed.push(data);
      return { created: observed.length === 1 };
    }));
  const financialBody = {
    dealRoomId: 'room-financial-shadow-admin-ingress',
    source: 'manual-fixture',
    command: {
      commandId: 'financial-shadow-command-1', idempotencyKey: 'financial-shadow-key-1', operation: 'STAKE',
      amountUsdc: '5', sourceAddress: '0x1111111111111111111111111111111111111111',
      destinationAddress: '0x2222222222222222222222222222222222222222',
      expectedDealRoomVersion: 1, mandateVersion: 1, nowUnix: 100,
    },
    policy: {
      autonomousMaxUsdc: '0', allowedDestinations: ['0x2222222222222222222222222222222222222222'],
      requireApprovalFor: ['STAKE'],
    },
    current: { dealRoomVersion: 1, mandateVersion: 1 },
    providerObservation: { lifecycle: 'UNKNOWN', providerId: 'provider-shadow-1' },
  };
  try {
    const response = await reviewedOperationIngressRoutes.request('/financial-shadow', {
      method: 'POST', headers, body: JSON.stringify(financialBody),
    });
    assert.equal(response.status, 202);
    const responseBody = await response.json() as {
      taskKind: string;
      providerWritesAuthorized: boolean;
      financialMutationsAuthorized: boolean;
    };
    assert.equal(responseBody.taskKind, 'financial.command.shadow');
    assert.equal(responseBody.providerWritesAuthorized, false);
    assert.equal(responseBody.financialMutationsAuthorized, false);
    const duplicate = await reviewedOperationIngressRoutes.request('/financial-shadow', {
      method: 'POST', headers, body: JSON.stringify(financialBody),
    });
    assert.equal(duplicate.status, 200);
    assert.equal(observed.length, 2);
    const invalid = await reviewedOperationIngressRoutes.request('/financial-shadow', {
      method: 'POST', headers, body: JSON.stringify({ nope: true }),
    });
    assert.equal(invalid.status, 400);
  } finally {
    dispose();
  }
});

test('stake qualification shadow ingress is strict, idempotent, and execution-free', async () => {
  const observed: unknown[] = [];
  const dispose = configureStakeQualificationShadowIngress(async (data) => {
    observed.push(data);
    return { created: observed.length === 1 };
  });
  const stakingBody = {
    dealRoomId: 'room-stake-shadow-admin-ingress',
    idempotencyKey: 'stake-shadow-admin-ingress-1',
    observedAtUnix: 100,
    source: 'manual-fixture',
    requirement: {
      requirementVersion: 1,
      requiredStakeUsdc: '500',
      stakeOwner: '0x1111111111111111111111111111111111111111',
      fundingWallet: '0x3333333333333333333333333333333333333333',
      vaultAddress: '0x2222222222222222222222222222222222222222',
      asset: 'USDC',
      network: 'arc-testnet',
    },
    snapshot: {
      freeStakeUsdc: '100',
      liquidFundingUsdc: '400',
      dealRoomOpen: true,
      mandateVersion: 1,
      expectedRequirementVersion: 1,
    },
    policy: {
      autonomousMaxUsdc: '0',
      allowedVaults: ['0x2222222222222222222222222222222222222222'],
      allowedNetworks: ['arc-testnet'],
      allowedAssets: ['USDC'],
    },
    blocker: {
      id: 'blocker-stake-shadow-admin-ingress',
      blockerKey: 'stake:room-stake-shadow-admin-ingress:v1',
      kind: 'STAKE_SHORTFALL',
      subject: 'seller-1',
      data: {},
    },
    confirmedFunding: false,
  };
  try {
    const response = await reviewedOperationIngressRoutes.request('/staking-shadow', {
      method: 'POST', headers, body: JSON.stringify(stakingBody),
    });
    assert.equal(response.status, 202);
    const responseBody = await response.json() as {
      taskKind: string;
      providerWritesAuthorized: boolean;
      stakeExecutionAuthorized: boolean;
      financialMutationsAuthorized: boolean;
    };
    assert.equal(responseBody.taskKind, 'stake.qualification.shadow');
    assert.equal(responseBody.providerWritesAuthorized, false);
    assert.equal(responseBody.stakeExecutionAuthorized, false);
    assert.equal(responseBody.financialMutationsAuthorized, false);

    const duplicate = await reviewedOperationIngressRoutes.request('/staking-shadow', {
      method: 'POST', headers, body: JSON.stringify(stakingBody),
    });
    assert.equal(duplicate.status, 200);
    assert.equal(observed.length, 2);
    const invalid = await reviewedOperationIngressRoutes.request('/staking-shadow', {
      method: 'POST', headers, body: JSON.stringify({ nope: true }),
    });
    assert.equal(invalid.status, 400);
  } finally {
    dispose();
  }
});

test('stake funding shadow ingress is strict, idempotent, and execution-free', async () => {
  const observed: unknown[] = [];
  const dispose = configureStakeFundingResumeIngress(async (data) => {
    observed.push(data);
    return { created: observed.length === 1 ? 1 : 0 };
  });
  const fundingBody = {
    agentAddress: '0x3333333333333333333333333333333333333333',
    amountUsdc: '15.25',
    movementState: 'completed',
    observedAtUnix: 200,
    reference: 'funding-route-1',
    txHash: `0x${'aa'.repeat(32)}`,
  };
  try {
    const response = await reviewedOperationIngressRoutes.request('/staking-funding-shadow', {
      method: 'POST', headers, body: JSON.stringify(fundingBody),
    });
    assert.equal(response.status, 202);
    const responseBody = await response.json() as {
      taskKind: string;
      created: boolean;
      resumedTasks: number;
      providerWritesAuthorized: boolean;
      stakeExecutionAuthorized: boolean;
      financialMutationsAuthorized: boolean;
    };
    assert.equal(responseBody.taskKind, 'stake.qualification.shadow');
    assert.equal(responseBody.created, true);
    assert.equal(responseBody.resumedTasks, 1);
    assert.equal(responseBody.providerWritesAuthorized, false);
    assert.equal(responseBody.stakeExecutionAuthorized, false);
    assert.equal(responseBody.financialMutationsAuthorized, false);

    const duplicate = await reviewedOperationIngressRoutes.request('/staking-funding-shadow', {
      method: 'POST', headers, body: JSON.stringify(fundingBody),
    });
    assert.equal(duplicate.status, 200);
    assert.equal((await duplicate.json()).resumedTasks, 0);
    assert.equal(observed.length, 2);
    const invalid = await reviewedOperationIngressRoutes.request('/staking-funding-shadow', {
      method: 'POST', headers, body: JSON.stringify({ ...fundingBody, extra: true }),
    });
    assert.equal(invalid.status, 400);
  } finally {
    dispose();
  }
});

test('reviewed financial operation ingress is strict and remains legacy-disconnected', async () => {
  const observed: unknown[] = [];
  const dispose = configureReviewedFinancialOperationIngress(async (data) => {
    observed.push(data);
    return { created: observed.length === 1 };
  });
  const operationBody = {
    dealRoomId: 'room-financial-operation-admin-ingress',
    source: 'manual-review',
    command: {
      commandId: 'financial-operation-command-1', idempotencyKey: 'financial-operation-key-1', operation: 'STAKE',
      amountUsdc: '5', sourceAddress: '0x1111111111111111111111111111111111111111',
      destinationAddress: '0x2222222222222222222222222222222222222222',
      expectedDealRoomVersion: 1, mandateVersion: 1, nowUnix: 100,
    },
    policy: {
      autonomousMaxUsdc: '0', allowedDestinations: ['0x2222222222222222222222222222222222222222'],
      requireApprovalFor: ['STAKE'],
    },
    current: { dealRoomVersion: 1, mandateVersion: 1 },
    descriptor: { kind: 'transfer', walletId: 'wallet-reviewed-1', tokenId: 'usdc-token', feeLevel: 'LOW' },
  };
  try {
    const response = await reviewedOperationIngressRoutes.request('/financial-operation', {
      method: 'POST', headers, body: JSON.stringify(operationBody),
    });
    assert.equal(response.status, 202);
    const responseBody = await response.json() as {
      taskKind: string;
      legacyRoutesEnqueue: boolean;
      providerWritesAuthorized: boolean;
      financialMutationsAuthorized: boolean;
    };
    assert.equal(responseBody.taskKind, 'financial.command.operation');
    assert.equal(responseBody.legacyRoutesEnqueue, false);
    assert.equal(responseBody.providerWritesAuthorized, false);
    assert.equal(responseBody.financialMutationsAuthorized, false);
    const duplicate = await reviewedOperationIngressRoutes.request('/financial-operation', {
      method: 'POST', headers, body: JSON.stringify(operationBody),
    });
    assert.equal(duplicate.status, 200);
    assert.equal(observed.length, 2);
    const invalid = await reviewedOperationIngressRoutes.request('/financial-operation', {
      method: 'POST', headers, body: JSON.stringify({ nope: true }),
    });
    assert.equal(invalid.status, 400);
  } finally {
    dispose();
  }
});

test('reviewed staking operation ingress projects only an exact policy-approved stake', async () => {
  const observed: unknown[] = [];
  const dispose = configureStakeFinancialOperationIngress(async (data) => {
    observed.push(data);
    return { created: observed.length === 1 };
  });
  const operationBody = {
    dealRoomId: 'room-staking-operation-admin-ingress',
    requirement: {
      requirementVersion: 2, requiredStakeUsdc: '500',
      stakeOwner: '0x1111111111111111111111111111111111111111',
      fundingWallet: '0x2222222222222222222222222222222222222222',
      vaultAddress: '0x3333333333333333333333333333333333333333', asset: 'USDC', network: 'arc-testnet',
    },
    snapshot: { freeStakeUsdc: '100', liquidFundingUsdc: '400', dealRoomOpen: true, mandateVersion: 7, expectedRequirementVersion: 2 },
    policy: { autonomousMaxUsdc: '400', allowedVaults: ['0x3333333333333333333333333333333333333333'], allowedNetworks: ['arc-testnet'], allowedAssets: ['USDC'] },
    decision: { outcome: 'auto_authorized', amountUsdc: '500', shortfallUsdc: '400', requirementVersion: 2 },
    observedAtUnix: 100,
    execution: { walletId: 'circle-seller-wallet-1', contractAddress: '0x3333333333333333333333333333333333333333', feeLevel: 'LOW', callData: '0x1234' },
  };
  try {
    const response = await reviewedOperationIngressRoutes.request('/staking-operation', {
      method: 'POST', headers, body: JSON.stringify(operationBody),
    });
    assert.equal(response.status, 202);
    const responseBody = await response.json() as Record<string, unknown>;
    assert.equal(responseBody.taskKind, 'financial.command.operation');
    assert.equal(responseBody.operation, 'STAKE');
    assert.equal(responseBody.providerWritesAuthorized, false);
    assert.equal(responseBody.financialMutationsAuthorized, false);
    const duplicate = await reviewedOperationIngressRoutes.request('/staking-operation', {
      method: 'POST', headers, body: JSON.stringify(operationBody),
    });
    assert.equal(duplicate.status, 200);
    assert.equal(observed.length, 2);
    const invalid = await reviewedOperationIngressRoutes.request('/staking-operation', {
      method: 'POST', headers, body: JSON.stringify({ ...operationBody, extra: true }),
    });
    assert.equal(invalid.status, 400);
  } finally {
    dispose();
  }
});

test('reviewed staking approval resume is read-only, strict, and idempotent', async () => {
  const observed: unknown[] = [];
  const dispose = configureStakeApprovalResumeIngress(async (data) => {
    observed.push(data);
    return { created: observed.length === 1, ...(observed.length > 1 ? {} : {}) };
  });
  const resumeBody = {
    dealRoomId: 'room-staking-resume-admin-ingress', approvalId: 'approval:resume-admin', observedAtUnix: 120,
    requirement: {
      requirementVersion: 2, requiredStakeUsdc: '500',
      stakeOwner: '0x1111111111111111111111111111111111111111',
      fundingWallet: '0x2222222222222222222222222222222222222222',
      vaultAddress: '0x3333333333333333333333333333333333333333', asset: 'USDC', network: 'arc-testnet',
    },
    snapshot: { freeStakeUsdc: '100', liquidFundingUsdc: '400', dealRoomOpen: true, mandateVersion: 7, expectedRequirementVersion: 2 },
    policy: { autonomousMaxUsdc: '250', allowedVaults: ['0x3333333333333333333333333333333333333333'], allowedNetworks: ['arc-testnet'], allowedAssets: ['USDC'] },
    actorAddress: '0x9999999999999999999999999999999999999999',
    execution: { walletId: 'circle-seller-wallet-1', contractAddress: '0x3333333333333333333333333333333333333333', feeLevel: 'LOW', callData: '0x1234' },
  };
  try {
    const response = await reviewedOperationIngressRoutes.request('/staking-operation-resume', {
      method: 'POST', headers, body: JSON.stringify(resumeBody),
    });
    assert.equal(response.status, 202);
    const responseBody = await response.json() as Record<string, unknown>;
    assert.equal(responseBody.taskKind, 'financial.command.operation');
    assert.equal(responseBody.operation, 'STAKE');
    assert.equal(responseBody.providerWritesAuthorized, false);
    assert.equal(responseBody.financialMutationsAuthorized, false);
    const duplicate = await reviewedOperationIngressRoutes.request('/staking-operation-resume', {
      method: 'POST', headers, body: JSON.stringify(resumeBody),
    });
    assert.equal(duplicate.status, 200);
    assert.equal(observed.length, 2);
    const invalid = await reviewedOperationIngressRoutes.request('/staking-operation-resume', {
      method: 'POST', headers, body: JSON.stringify({ ...resumeBody, extra: true }),
    });
    assert.equal(invalid.status, 400);
  } finally {
    dispose();
  }
});
