import { AppKit } from '@circle-fin/app-kit';
import { createCircleWalletsAdapter } from '@circle-fin/adapter-circle-wallets';
import { config } from '../config.js';

/// Single shared App Kit instance. Use this for any new bridge / send / swap /
/// unified-balance feature instead of hand-rolling CCTP burn / attestation /
/// mint, ERC-20 approve+transfer, or DEX routing. The Circle Wallets adapter
/// sits on top of the same DCW + entity-secret credentials we already use, so
/// existing wallet IDs are reusable as `from`/`to.adapter` source.
///
/// New cross-chain feature recipe:
///   1) `import { kit, circleAdapter } from '../chain/appKit.js';`
///   2) `await kit.bridge({ from: { adapter: circleAdapter, chain: 'Ethereum_Sepolia' },
///                          to:   { adapter: circleAdapter, chain: 'Arc_Testnet' },
///                          amount: '1.00' });`
///   3) Wrap with the resumable pipeline pattern from bridge.ts if you need
///      retries + user-facing status surfacing.
///
/// Returns null when CIRCLE_API_KEY or CIRCLE_ENTITY_SECRET isn't set, so the
/// app keeps booting in environments without Circle creds (e.g., local tests).

interface AppKitBundle {
  kit: AppKit;
  circleAdapter: ReturnType<typeof createCircleWalletsAdapter>;
}

function build(): AppKitBundle | null {
  if (!config.CIRCLE_API_KEY || !config.CIRCLE_ENTITY_SECRET) return null;
  const kit = new AppKit();
  const circleAdapter = createCircleWalletsAdapter({
    apiKey: config.CIRCLE_API_KEY,
    entitySecret: config.CIRCLE_ENTITY_SECRET,
  });
  return { kit, circleAdapter };
}

const bundle = build();

export const kit: AppKit | null = bundle?.kit ?? null;
export const circleAdapter: ReturnType<typeof createCircleWalletsAdapter> | null =
  bundle?.circleAdapter ?? null;

/// Throw-on-null variant for code paths that require the kit to be configured.
/// Use in routes that should 502 when Circle creds are missing rather than
/// silently no-op.
export function requireAppKit(): AppKitBundle {
  if (!bundle) {
    throw new Error(
      'App Kit not configured: set CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET to enable bridge/send/swap/unified-balance via @circle-fin/app-kit',
    );
  }
  return bundle;
}
