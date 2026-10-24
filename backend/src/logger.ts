import { pino } from 'pino';
import { config } from './config.js';
import { platformKeySecrets, redactingStream, rpcSecretUrls } from './security/rpcUrlRedact.js';

const RPC_SECRET_URLS = rpcSecretUrls(process.env);
const PLATFORM_KEYS = platformKeySecrets(process.env);

/// Production lines go through the scrubber: viem prints keyed RPC URLs in its
/// errors, Karwan's platform keys must never be written anywhere, and container
/// logs outlive any key rotation.
export const logger = pino({
  level: config.LOG_LEVEL,
  base: { service: 'karwan-backend' },
  transport:
    config.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' },
        }
      : undefined,
}, config.NODE_ENV === 'development' ? undefined : redactingStream(process.stdout, RPC_SECRET_URLS, PLATFORM_KEYS));

export type Logger = typeof logger;
