/// Resolving the Solana wallet, correctly.
///
/// `window.solana` is a LEGACY alias that any extension can claim, and several
/// do. Sollet squats it, and sollet cannot handle the CCTP burn we hand it: its
/// confirm dialog sits on a loading skeleton with the button disabled, because
/// it never decodes the transaction. Reading `window.solana` blindly and calling
/// the result "phantom" is what produced that dead popup.
///
/// Phantom's canonical injection is `window.phantom.solana`, and it sets
/// `isPhantom`. Prefer the namespace, accept the legacy alias ONLY when it
/// identifies itself, and otherwise report what we actually found so the UI can
/// name it instead of hanging.
///
/// The burn is hand-built (see solanaCctp.ts) and verified against Phantom only,
/// so this deliberately does not fall back to an unknown provider.

export interface SolanaProvider {
  isPhantom?: boolean;
  publicKey?: { toString(): string } | null;
  isConnected?: boolean;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } }>;
  disconnect(): Promise<void>;
  on(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
  signAndSendTransaction?: (tx: unknown) => Promise<{ signature: string }>;
  signTransaction?: (tx: unknown) => Promise<unknown>;
}

interface SolanaWindow {
  phantom?: { solana?: SolanaProvider };
  solana?: SolanaProvider & { isSollet?: boolean; isSolflare?: boolean; isBackpack?: boolean };
}

/// Phantom, or null. Never an arbitrary provider.
export function getPhantomProvider(): SolanaProvider | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as SolanaWindow;
  const namespaced = w.phantom?.solana;
  if (namespaced?.isPhantom) return namespaced;
  if (w.solana?.isPhantom) return w.solana;
  return null;
}

/// A Solana wallet IS installed, but it is not Phantom. Returns its name so the
/// UI can say which one it found rather than claiming none exists.
export function getConflictingWalletName(): string | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as SolanaWindow;
  if (getPhantomProvider()) return null;
  const other = w.solana;
  if (!other) return null;
  if (other.isSollet) return 'Sollet';
  if (other.isSolflare) return 'Solflare';
  if (other.isBackpack) return 'Backpack';
  return 'Another Solana wallet';
}
