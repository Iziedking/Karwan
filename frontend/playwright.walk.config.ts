import { defineConfig, devices } from '@playwright/test';

/// The internal test bed (audit/TEST_BED_2026-11-05.md): real backend, real
/// Arc Testnet, real Circle wallets. Run only through scripts/ops/walk-remote.sh,
/// which starts the stack and sets WALK_FRONTEND and WALK_BACKEND.
const frontend = process.env.WALK_FRONTEND;
if (!frontend || !process.env.WALK_BACKEND) throw new Error('run the walk through scripts/ops/walk-remote.sh');

export default defineConfig({
  testDir: './walk',
  // A deal on testnet waits for Circle and the chain at every step.
  timeout: 15 * 60_000,
  expect: { timeout: 60_000 },
  workers: 1,
  forbidOnly: true,
  retries: 0,
  use: { baseURL: frontend, reducedMotion: 'reduce', trace: 'retain-on-failure', ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
});
