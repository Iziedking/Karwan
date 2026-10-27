/// Arc's predeployed batcher (docs.arc.io, batched transactions). A person's own
/// transaction can carry their Karwan record steps through it (view 27, decision
/// 10). Every call inside keeps their wallet as the sender, so a receipt sent to
/// it is still proved by the target contract's events, as a direct one is.
export const MULTICALL3FROM = '0x522faf9a91c41c443c66765030741e4aace147d0';

/// Whether a receipt's outer target is the contract itself, or Arc's batcher
/// carrying a call to it.
export function sentTo(receiptTo: string | null | undefined, target: string): boolean {
  const to = (receiptTo ?? '').toLowerCase();
  return to === target.toLowerCase() || to === MULTICALL3FROM;
}
