/// Daily VPS backup of Karwan's off-chain state. Runs INSIDE the api
/// container so the only host-side requirement is `docker compose exec`.
///
/// Snapshots:
///   1. Postgres dump (pg_dump --no-owner --no-privileges | gzip)
///   2. Tar.gz of /app/backend/data (the mounted flat-file fallback)
///   3. Gzip of /app/backend/.env-snapshot (the host's .env mounted read-only
///      via docker-compose). Holds CIRCLE_ENTITY_SECRET + contract addresses
///      + B2 credentials. Without this the backup is unrestorable in
///      isolation. Also keep a separate copy in a password manager so the
///      B2 credentials needed to download the backup don't live ONLY in
///      the backup.
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
import {
  createReadStream,
  statSync,
  mkdtempSync,
  rmSync,
  createWriteStream,
  existsSync,
} from 'node:fs';
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
const ENV_SNAPSHOT_PATH = env.KARWAN_BACKUP_ENV_PATH ?? '/app/backend/.env-snapshot';
const CRONTAB_SNAPSHOT_PATH =
  env.KARWAN_BACKUP_CRONTAB_PATH ?? '/app/backend/.host-crontab-snapshot';
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

/// Gzip a single host-mounted file to its own blob. We don't tar these —
/// they're single files, gzip alone is faster and still decompresses
/// cleanly via `gunzip`. Missing source = a soft warning, not a failure:
/// the operator may not have the mount wired yet on first deploy.
async function gzipFile(
  label: string,
  srcPath: string,
  outPath: string,
  missingHint: string,
): Promise<boolean> {
  if (!existsSync(srcPath)) {
    log.warn({ srcPath, label }, missingHint);
    return false;
  }
  log.info({ outPath, src: srcPath, label }, 'gzip start');
  const gz = spawn('gzip', ['-c', srcPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stderr: string[] = [];
  gz.stderr.on('data', (c) => stderr.push(c.toString()));
  const out = createWriteStream(outPath);
  const piped = pipeline(gz.stdout, out);
  const gzExit = new Promise<number>((res, rej) => {
    gz.on('error', rej);
    gz.on('exit', (c) => res(c ?? -1));
  });
  await piped;
  const code = await gzExit;
  if (code !== 0) {
    log.error({ code, stderr: stderr.join(''), label }, 'gzip failed');
    throw new Error(`gzip ${label} exited ${code}`);
  }
  const size = statSync(outPath).size;
  log.info({ size, label }, 'gzip ok');
  return true;
}

/// Retry transient B2/S3 stream errors. The AWS SDK calls some failures
/// "non-retryable streaming requests" — TLS resets, HTTP/2 GOAWAYs, brief
/// 5xx with an unrewindable body — and bails on the first one. We've seen
/// the backup crash on the env upload (the third PUT) after db+data went
/// through fine, taking the heartbeat down with it. Each attempt opens a
/// fresh ReadStream because Node streams aren't replayable.
const UPLOAD_RETRIES = 3;
const UPLOAD_BACKOFF_MS = 1_500;

async function upload(key: string, filePath: string): Promise<void> {
  const size = statSync(filePath).size;
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= UPLOAD_RETRIES; attempt++) {
    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: B2_BUCKET,
          Key: key,
          Body: createReadStream(filePath),
          ContentLength: size,
          ContentType: 'application/gzip',
        }),
      );
      if (attempt > 1) log.warn({ key, attempt }, 'upload recovered after retry');
      log.info({ key, size }, 'uploaded');
      return;
    } catch (err) {
      lastErr = err as Error;
      log.warn(
        { key, attempt, err: lastErr.message },
        attempt < UPLOAD_RETRIES ? 'upload failed; retrying' : 'upload failed; giving up',
      );
      if (attempt < UPLOAD_RETRIES) {
        await new Promise((r) => setTimeout(r, UPLOAD_BACKOFF_MS * attempt));
      }
    }
  }
  throw lastErr ?? new Error(`upload ${key} failed`);
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

/// Healthchecks.io convention: GET <base>  → success, GET <base>/fail → fail,
/// GET <base>/start → "started, expecting a success ping". Sending a fail
/// ping on crash gives the operator a real failure email instead of a
/// silent "no ping arrived in time" timeout an hour later.
async function pingHeartbeat(kind: 'ok' | 'fail' = 'ok'): Promise<void> {
  if (!HEARTBEAT_URL) return;
  const url = kind === 'fail' ? `${HEARTBEAT_URL.replace(/\/+$/, '')}/fail` : HEARTBEAT_URL;
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 10_000);
    await fetch(url, { signal: ctl.signal });
    clearTimeout(to);
    log.info({ kind }, 'heartbeat sent');
  } catch (err) {
    log.warn({ err: (err as Error).message, kind }, 'heartbeat send failed (non-fatal)');
  }
}

async function main(): Promise<void> {
  const stamp = ts();
  const dir = mkdtempSync(join(tmpdir(), 'karwan-backup-'));
  try {
    const dbFile = join(dir, `karwan-db-${stamp}.sql.gz`);
    const dataFile = join(dir, `karwan-data-${stamp}.tar.gz`);
    const envFile = join(dir, `karwan-env-${stamp}.gz`);
    const cronFile = join(dir, `karwan-crontab-${stamp}.gz`);

    await dumpPostgres(dbFile);
    await tarData(dataFile);
    const envOk = await gzipFile(
      'env',
      ENV_SNAPSHOT_PATH,
      envFile,
      'env snapshot not mounted; skipping. Add `./.env:/app/backend/.env-snapshot:ro` to docker-compose.yml',
    );
    /// Host crontab snapshot. The cron line that invokes this script writes
    /// `crontab -l` to ~/karwan/host-crontab.txt before exec'ing, and the
    /// host mounts that file in read-only at .host-crontab-snapshot. Missing
    /// = the operator either skipped the mount or hasn't run cron yet; either
    /// way, the rest of the backup still ships clean.
    const cronOk = await gzipFile(
      'crontab',
      CRONTAB_SNAPSHOT_PATH,
      cronFile,
      'crontab snapshot not mounted; skipping. Add `./host-crontab.txt:/app/backend/.host-crontab-snapshot:ro` to docker-compose.yml and chain `crontab -l > ~/karwan/host-crontab.txt` into the backup cron line',
    );

    await upload(`db/${stamp}.sql.gz`, dbFile);
    await upload(`data/${stamp}.tar.gz`, dataFile);
    if (envOk) await upload(`env/${stamp}.env.gz`, envFile);
    if (cronOk) await upload(`crontab/${stamp}.crontab.gz`, cronFile);

    await pruneOld('db/');
    await pruneOld('data/');
    await pruneOld('env/');
    await pruneOld('crontab/');

    await pingHeartbeat();
    log.info({ stamp, bucket: B2_BUCKET }, 'backup complete');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch(async (err) => {
  log.error({ err: (err as Error).message }, 'backup crashed');
  // Tell healthchecks.io explicitly the run failed. Without this, the next
  // success-only ping never lands and the operator gets a delayed "DOWN
  // (no ping in time)" email — the active /fail variant arrives within
  // seconds.
  await pingHeartbeat('fail');
  process.exit(1);
});
