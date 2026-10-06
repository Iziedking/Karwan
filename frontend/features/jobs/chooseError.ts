/// Which message a refused offer choice shows. Every refusal says why, so a
/// buyer is never left with "try again" for something trying again cannot fix.
export type ChooseErrorKey = 'noFunds' | 'closed' | 'taken' | 'gone' | 'notYours' | 'busy' | 'failed';

export function chooseErrorKey(status: number, code: string | undefined): ChooseErrorKey {
  if (code === 'INSUFFICIENT_AGENT_BALANCE') return 'noFunds';
  if (code === 'CLOSED') return 'closed';
  if (code === 'ALREADY_FUNDED' || code === 'ALREADY_APPROVED') return 'taken';
  if (code === 'NO_OFFER') return 'gone';
  if (status === 403) return 'notYours';
  if (status === 409 && !code) return 'busy';
  return 'failed';
}
