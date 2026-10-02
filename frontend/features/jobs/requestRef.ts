/// A reference a person can read aloud: REQ- and the first eight characters of
/// the request id, in two groups. The full id stays in the address bar and
/// under Proof on Arc.
export function requestRef(jobId: string): string {
  const hex = jobId.replace(/^0x/i, '').toUpperCase();
  return `REQ-${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}

export type RequestStep = 0 | 1 | 2 | 3;

/// Which of Posted, Offers, Agreed, Paid the request is on.
export function requestStep(input: { offers: number; matched: boolean; agreed: boolean; funded: boolean }): RequestStep {
  if (input.funded) return 3;
  if (input.agreed) return 2;
  if (input.matched || input.offers > 0) return 1;
  return 0;
}
