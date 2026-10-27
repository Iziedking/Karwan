/// How a transaction from the person's own wallet carries the steps still missing
/// from their Karwan record (view 27, decision 10). Their own calls come first and
/// must succeed; the record steps after them may each fail alone, so adding the
/// record can never make the person's own transaction fail.

type Hex = `0x${string}`;

export type RecordStepName = 'register' | 'unbindExpired' | 'bindBuyer' | 'bindSeller';
export type RecordStep = { name: RecordStepName; to: Hex; data: Hex };
/// One of the person's own calls. Never carries native value: Arc's batcher does
/// not forward it, and every USDC move in the app is an ERC-20 call.
export type OwnCall = { to: Hex; data: Hex; needsRecord?: boolean };
export type Call3 = { target: Hex; allowFailure: boolean; callData: Hex };

/// The record steps ride along only with this much fee to spare.
export const FEE_MARGIN = 2n;
/// And only while the agents' signatures have this long left.
export const MIN_SECONDS_LEFT = 120;

/// Whether the record steps go along with this transaction.
export function recordFits(i: {
  steps: readonly RecordStep[];
  spendsWholeBalance: boolean;
  balanceAfterMicros: bigint;
  extraFeeMicros: bigint;
  validUntil: number;
  nowSecs: number;
}): boolean {
  if (i.steps.length === 0 || i.spendsWholeBalance) return false;
  if (i.validUntil - i.nowSecs < MIN_SECONDS_LEFT) return false;
  return i.balanceAfterMicros >= i.extraFeeMicros * FEE_MARGIN;
}

/// The calls in the order they go out. When a call of the person's needs the
/// record, `register` goes first and must succeed; otherwise the person's calls
/// go first. With no calls of their own, the record goes alone and `register`
/// must succeed.
export function orderCalls(calls: readonly OwnCall[], steps: readonly RecordStep[]): Call3[] {
  const own = calls.map((c): Call3 => ({ target: c.to, allowFailure: false, callData: c.data }));
  const step = (s: RecordStep, mustSucceed: boolean): Call3 => ({ target: s.to, allowFailure: !mustSucceed, callData: s.data });
  const register = steps.find((s) => s.name === 'register');
  const rest = steps.filter((s) => s.name !== 'register');
  if (register && (calls.length === 0 || calls.some((c) => c.needsRecord))) {
    return [step(register, true), ...own, ...rest.map((s) => step(s, false))];
  }
  return [...own, ...steps.map((s) => step(s, false))];
}
