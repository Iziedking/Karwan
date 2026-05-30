/// Daily VPS backup of Karwan's off-chain state. Runs INSIDE the api
/// container so the only host-side requirement is `docker compose exec`.
///
/// Snapshots:
///   1. Postgres dump (pg_dump --no-owner --no-privileges | gzip)
///   2. Tar.gz of /app/backend/data (the mounted flat-file fallback)
///
/// Uploads both to a Backblaze B2 bucket via B2's S3-compatible API. The
/// AWS SDK works against any S3-compatible endpoint, so swapping to a
/// different provider later is one env var.
///
/// Free-tier-friendly: B2 gives 10 GB stored + 30 GB egress/month free
/// forever. Karwan's snapshots fit ~100x over for a long time.
///
/// Cron on the host (daily 03:07 UTC):
///   7 3 * * * docker compose -f ~/karwan/docker-compose.yml exec -T karwan-api \
///     node dist/scripts/backup-karwan.js >> /var/log/karwan-backup.log 2>&1
///
/// Required env (set in .env, picked up via docker compose env_file):
///   DATABASE_URL              Postgres connection string (already required)
///   B2_KEY_ID                 Backblaze application keyID (S3 access key ID)
///   B2_APPLICATION_KEY        Backblaze application key (S3 secret)
///   B2_BUCKET                 Bucket name, e.g. "karwan-backups"
///   B2_ENDPOINT               e.g. "https://s3.us-west-002.backblazeb2.com"
///   B2_REGION                 e.g. "us-west-002"
///
/// Optional:
///   KARWAN_BACKUP_RETENTION_DAYS    Default 28
///   KARWAN_BACKUP_DATA_DIR          Default /app/backend/data
///   KARWAN_BACKUP_HEARTBEAT_URL     Healthchecks.io / Better Stack ping URL
import { spawn } from 'node:child_process';
import { createReadStream, statSync, mkdtempSync, rmSync, createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  type _Object,
} from '@aws-sdk/client-s3';
import { logger as base } from '../logger.js';

const log = base.child({ scope: 'backup' });

const env = process.env;
const required = (name: string): string => {
  const v = env[name];
  if (!v) {
    log.error({ name }, 'missing required env');
    process.exit(1);
  }
  return v;
};

const DATABASE_URL = required('DATABASE_URL');
const B2_KEY_ID = required('B2_KEY_ID');
const B2_APPLICATION_KEY = required('B2_APPLICATION_KEY');
const B2_BUCKET = required('B2_BUCKET');
const B2_ENDPOINT = required('B2_ENDPOINT');
const B2_REGION = required('B2_REGION');

const RETENTION_DAYS = Number(env.KARWAN_BACKUP_RETENTION_DAYS ?? '28');
const DATA_DIR = env.KARWAN_BACKUP_DATA_DIR ?? '/app/backend/data';
const HEARTBEAT_URL = env.KARWAN_BACKUP_HEARTBEAT_URL ?? '';

const s3 = new S3Client({
  region: B2_REGION,
  endpoint: B2_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: B2_KEY_ID,
    secretAccessKey: B2_APPLICATION_KEY,
  },
});

/// ISO timestamp safe for filenames (no colons).
function ts(): string {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z');
}

/// Stream pg_dump → gzip → file. Refuses to claim success unless pg_dump
/// exits cleanly. Avoids buffering the dump in memory.
async function dumpPostgres(outPath: string): Promise<void> {
  log.info({ outPath }, 'pg_dump start');
  const dump = spawn(
    'pg_dump',
    ['--no-owner', '--no-privileges', DATABASE_URL],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const stderr: string[] = [];
  dump.stderr.on('data', (chunk) => stderr.push(chunk.toString()));
  const gz = createGzip();
  const out = createWriteStream(outPath);
  const piped = pipeline(dump.stdout, gz, out);
  const dumpExit = new Promise<number>((res, rej) => {
    dump.on('error', rej);
    dump.on('exit', res);
  });
  await piped;
  const code = await dumpExit;
  if (code !== 0) {
    log.error({ code, stderr: stderr.join('') }, 'pg_dump failed');
    throw new Error(`pg_dump exited ${code}`);
  }
  const size = statSync(outPath).size;
  log.info({ size }, 'pg_dump ok');
}

/// Tar + gzip the data dir. Same one-shot approach: stream to disk so
/// memory stays flat regardless of data size.
async function tarData(outPath: string): Promise<void> {
  log.info({ outPath, dataDir: DATA_DIR }, 'tar data start');
  // Tar from the parent so the archive contains `data/` (not absolute paths).
  // Alpine's tar supports -C; works the same as GNU tar here.
  const tar = spawn(
    'tar',
    ['-czf', outPath, '-C', '/app/backend', 'data'],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  const stderr: string[] = [];
  tar.stderr.on('data', (c) => stderr.push(c.toString()));
  const code: number = await new Promise((res, rej) => {
    tar.on('error', rej);
    tar.on('exit', res);
  });
  if (code !== 0) {
    log.error({ code, stderr: stderr.join('') }, 'tar failed');
    throw new Error(`tar exited ${code}`);
  }
  const size = statSync(outPath).size;
  log.info({ size }, 'tar ok');
}

async function upload(key: string, filePath: string): Promise<void> {
  const body = createReadStream(filePath);
  const size = statSync(filePath).size;
  await s3.send(
    new PutObjectCommand({
      Bucket: B2_BUCKET,
      Key: key,
      Body: body,
      ContentLength: size,
      ContentType: 'application/gzip',
    }),
  );
  log.info({ key, size }, 'uploaded');
}

/// Walk the bucket for the prefix, delete anything older than the retention
/// window. Idempotent; safe to re-run if a prune was interrupted.
async function pruneOld(prefix: string): Promise<void> {
  const cutoff = Date.now() - RETENTION_DAYS * 86_400_000;
  let continuationToken: string | undefined;
  let pruned = 0;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: B2_BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    const objects: _Object[] = res.Contents ?? [];
    for (const obj of objects) {
      if (!obj.Key || !obj.LastModified) continue;
      if (obj.LastModified.getTime() >= cutoff) continue;
      await s3.send(new DeleteObjectCommand({ Bucket: B2_BUCKET, Key: obj.Key }));
      pruned += 1;
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);
  if (pruned > 0) log.info({ prefix, pruned, retentionDays: RETENTION_DAYS }, 'prune ok');
}

async function pingHeartbeat(): Promise<void> {
  if (!HEARTBEAT_URL) return;
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 10_000);
    await fetch(HEARTBEAT_URL, { signal: ctl.signal });
    clearTimeout(to);
    log.info('heartbeat ok');
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'heartbeat failed (non-fatal)');
  }
}

async function main(): Promise<void> {
  const stamp = ts();
  const dir = mkdtempSync(join(tmpdir(), 'karwan-backup-'));
  try {
    const dbFile = join(dir, `karwan-db-${stamp}.sql.gz`);
    const dataFile = join(dir, `karwan-data-${stamp}.tar.gz`);

    await dumpPostgres(dbFile);
    await tarData(dataFile);

    await upload(`db/${stamp}.sql.gz`, dbFile);
    await upload(`data/${stamp}.tar.gz`, dataFile);

    await pruneOld('db/');
    await pruneOld('data/');

    await pingHeartbeat();
    log.info({ stamp, bucket: B2_BUCKET }, 'backup complete');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  log.error({ err: (err as Error).message }, 'backup crashed');
  process.exit(1);
});
