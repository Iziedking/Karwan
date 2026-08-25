import { circleWalletsClient } from './wallets.js';

export type ProviderTransactionStatus =
  | 'INITIATED'
  | 'CLEARED'
  | 'QUEUED'
  | 'SENT'
  | 'CONFIRMED'
  | 'COMPLETE'
  | 'CANCELLED'
  | 'DENIED'
  | 'FAILED'
  | 'STUCK'
  | 'UNKNOWN';

export interface BalanceQuery {
  walletId: string;
  tokenId?: string;
}

export interface BalanceSnapshot {
  walletId: string;
  observedAt: number;
  balances: readonly { tokenId: string; amount: string }[];
}

export interface PolicyQuery {
  walletId: string;
  operation: string;
}

export interface PolicySnapshot {
  walletId: string;
  operation: string;
  allowed: boolean;
  version: string;
  expiresAt?: number;
}

export interface ProviderTransaction {
  providerId: string;
  status: ProviderTransactionStatus;
  txHash?: string;
  raw: Readonly<Record<string, unknown>>;
}

export interface AuthorizedTransferCommand {
  idempotencyKey: string;
  walletId: string;
  tokenId: string;
  destinationAddress: string;
  amountUsdc: string;
  feeLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface AuthorizedContractCommand {
  idempotencyKey: string;
  walletId: string;
  contractAddress: string;
  feeLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  amount?: string;
  abiFunctionSignature?: string;
  abiParameters?: readonly unknown[];
  callData?: string;
}

export interface Submission {
  providerId: string;
  status: ProviderTransactionStatus;
}

export interface CircleWalletAdapter {
  getBalance(input: BalanceQuery): Promise<BalanceSnapshot>;
  getPolicy(input: PolicyQuery): Promise<PolicySnapshot | null>;
  getTransaction(providerId: string): Promise<ProviderTransaction>;
  createTransfer(command: AuthorizedTransferCommand): Promise<Submission>;
  executeContract(command: AuthorizedContractCommand): Promise<Submission>;
  getTransactionStatus(providerId: string): Promise<ProviderTransactionStatus>;
}

type CircleClient = Pick<
  ReturnType<typeof circleWalletsClient>,
  'getWalletTokenBalance' | 'getTransaction' | 'createTransaction' | 'createContractExecutionTransaction'
>;

interface AdapterOptions {
  client?: CircleClient;
  clock?: () => number;
  policyReader?: (input: PolicyQuery) => Promise<PolicySnapshot | null>;
}

function required(value: string, label: string): string {
  if (!value.trim()) throw new Error(`${label} is required`);
  return value;
}

function feeLevel(value: unknown): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (value === 'LOW' || value === 'MEDIUM' || value === 'HIGH') return value;
  throw new Error('feeLevel must be LOW, MEDIUM, or HIGH');
}

function callData(value: string): `0x${string}` {
  if (!/^0x[0-9a-f]+$/i.test(value) || (value.length - 2) % 2 !== 0) {
    throw new Error('callData must be even-length hexadecimal with a 0x prefix');
  }
  return value as `0x${string}`;
}

function status(value: unknown): ProviderTransactionStatus {
  const normalized = typeof value === 'string' ? value.toUpperCase() : '';
  if (normalized === 'INITIATED' || normalized === 'CLEARED' || normalized === 'QUEUED'
    || normalized === 'SENT' || normalized === 'CONFIRMED' || normalized === 'COMPLETE'
    || normalized === 'CANCELLED' || normalized === 'DENIED' || normalized === 'FAILED'
    || normalized === 'STUCK') return normalized;
  return 'UNKNOWN';
}

function responseData(response: unknown): Record<string, unknown> {
  if (!response || typeof response !== 'object') return {};
  const data = (response as { data?: unknown }).data;
  return data && typeof data === 'object' ? data as Record<string, unknown> : {};
}

function transactionPayload(response: unknown): Record<string, unknown> {
  const data = responseData(response);
  const transaction = data.transaction;
  return transaction && typeof transaction === 'object' ? transaction as Record<string, unknown> : data;
}

function providerIdFrom(response: unknown): string {
  const data = responseData(response);
  const payload = transactionPayload(response);
  const id = payload.id ?? data.id;
  return typeof id === 'string' && id.trim() ? id : (() => { throw new Error('Circle response omitted provider transaction id'); })();
}

function transactionFrom(providerId: string, response: unknown): ProviderTransaction {
  const payload = transactionPayload(response);
  const txHash = payload.txHash ?? payload.transactionHash;
  return {
    providerId,
    status: status(payload.state ?? payload.status),
    ...(typeof txHash === 'string' && txHash.trim() ? { txHash } : {}),
    raw: payload,
  };
}

export function createCircleWalletAdapter(options: AdapterOptions = {}): CircleWalletAdapter {
  const client = options.client ?? circleWalletsClient();
  const clock = options.clock ?? Date.now;
  return {
    async getBalance(input) {
      const walletId = required(input.walletId, 'walletId');
      const response = await client.getWalletTokenBalance({ id: walletId, includeAll: true });
      const data = responseData(response);
      const rows = Array.isArray(data.tokenBalances) ? data.tokenBalances : [];
      const balances = rows.flatMap((row) => {
        if (!row || typeof row !== 'object') return [];
        const item = row as Record<string, unknown>;
        const tokenId = item.tokenId ?? (typeof item.token === 'object' && item.token ? (item.token as Record<string, unknown>).id : undefined);
        const amount = item.amount;
        return typeof tokenId === 'string' && typeof amount === 'string' ? [{ tokenId, amount }] : [];
      });
      return {
        walletId,
        observedAt: clock(),
        balances: input.tokenId ? balances.filter((balance) => balance.tokenId === input.tokenId) : balances,
      };
    },
    async getPolicy(input) {
      return options.policyReader ? options.policyReader(input) : null;
    },
    async getTransaction(providerId) {
      const id = required(providerId, 'providerId');
      return transactionFrom(id, await client.getTransaction({ id }));
    },
    async createTransfer(command) {
      const idempotencyKey = required(command.idempotencyKey, 'idempotencyKey');
      const selectedFeeLevel = feeLevel(command.feeLevel);
      const response = await client.createTransaction({
        idempotencyKey,
        walletId: required(command.walletId, 'walletId'),
        tokenId: required(command.tokenId, 'tokenId'),
        destinationAddress: required(command.destinationAddress, 'destinationAddress'),
        amount: [required(command.amountUsdc, 'amountUsdc')],
        fee: { type: 'level' as const, config: { feeLevel: selectedFeeLevel } },
      });
      const providerId = providerIdFrom(response);
      return { providerId, status: status(responseData(response).state ?? transactionPayload(response).state) };
    },
    async executeContract(command) {
      const idempotencyKey = required(command.idempotencyKey, 'idempotencyKey');
      if (!command.abiFunctionSignature && !command.callData) throw new Error('abiFunctionSignature or callData is required');
      const selectedFeeLevel = feeLevel(command.feeLevel);
      const base = {
        idempotencyKey,
        walletId: required(command.walletId, 'walletId'),
        contractAddress: required(command.contractAddress, 'contractAddress'),
        fee: { type: 'level' as const, config: { feeLevel: selectedFeeLevel } },
        ...(command.amount === undefined ? {} : { amount: command.amount }),
      };
      const request = command.callData
        ? { ...base, callData: callData(command.callData) }
        : { ...base, abiFunctionSignature: required(command.abiFunctionSignature ?? '', 'abiFunctionSignature'), abiParameters: [...(command.abiParameters ?? [])] };
      const response = await client.createContractExecutionTransaction(request);
      const providerId = providerIdFrom(response);
      return { providerId, status: status(responseData(response).state ?? transactionPayload(response).state) };
    },
    async getTransactionStatus(providerId) {
      return (await this.getTransaction(providerId)).status;
    },
  };
}
