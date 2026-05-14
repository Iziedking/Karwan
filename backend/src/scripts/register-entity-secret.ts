import { mkdirSync } from 'node:fs';
import { registerEntitySecretCiphertext } from '@circle-fin/developer-controlled-wallets';
import { config } from '../config.js';
import { logger } from '../logger.js';

async function main() {
  if (!config.CIRCLE_API_KEY) throw new Error('CIRCLE_API_KEY is required');
  if (!config.CIRCLE_ENTITY_SECRET) throw new Error('CIRCLE_ENTITY_SECRET is required');

  const recoveryDir = './recovery';
  mkdirSync(recoveryDir, { recursive: true });

  await registerEntitySecretCiphertext({
    apiKey: config.CIRCLE_API_KEY,
    entitySecret: config.CIRCLE_ENTITY_SECRET,
    recoveryFileDownloadPath: recoveryDir,
  });

  logger.info({ recoveryDir }, 'entity secret registered');
  logger.warn(`recovery file written under ${recoveryDir}/. Move it offline. Circle cannot recover the secret for you.`);
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : err }, 'register-entity-secret failed');
  process.exit(1);
});
