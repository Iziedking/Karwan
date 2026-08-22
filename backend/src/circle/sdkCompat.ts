import { createRequire } from 'node:module';

/// Circle publishes both ESM and CommonJS entry points. The backend runs as
/// ESM in production, while tsx uses the package's legacy `module` field in
/// development and tests. Loading the CommonJS entry point through
/// createRequire keeps both runtimes on the same named-export surface.
const require = createRequire(import.meta.url);

export const developerWallets = require(
  '@circle-fin/developer-controlled-wallets',
) as typeof import('@circle-fin/developer-controlled-wallets');

export const appKit = require('@circle-fin/app-kit') as typeof import('@circle-fin/app-kit');

export const circleWalletsAdapter = require(
  '@circle-fin/adapter-circle-wallets',
) as typeof import('@circle-fin/adapter-circle-wallets');
