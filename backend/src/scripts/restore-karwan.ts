/// Restore from the latest Backblaze B2 snapshot. Companion to
/// backup-karwan.ts.
///
/// Usage:
///   docker compose exec -T karwan-api node dist/scripts/restore-karwan.js
///
/// Behavior:
///   - Lists the bucket, picks the most recent db/ and data/ snapshot.
///   - Streams the db snapshot into psql.
///   - Extracts the data snapshot over /app/backend/data.
///
/// Safety:
///   - Refuses to run unless KARWAN_RESTORE_CONFIRM=yes is set in env. The
///     restore wipes whatever the bound volume currently has and replays
///     the snapshot. Treat as a one-shot operator action.
///   - KARWAN_RESTORE_SKIP_DB=1 skips the Postgres restore (common when the
///     VPS died but the managed DB is still alive).
///   - KARWAN_RESTORE_STAMP=<ts> pins a specific snapshot instead of
///     latest, e.g. "20260530T030712Z".
import { spawn } from 'node:child_process';
import {
  createWriteStream,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import type { ChildProcess } from 'node:child_process';
import {
  S3Client,
  GetObjectCommand,
  ListObjectsV2Command,
  type _Object,
} from '@aws-sdk/client-s3';
import { logger as base } from '../logger.js';

const log = base.child({ scope: 'restore' });

const env = process.env;
const required = (name: string): string => {
  const v = env[name];
  if (!v) {
    log.error({ name }, 'missing required env');
    process.exit(1);
  }
  return v;
};

if (env.KARWAN_RESTORE_CONFIRM !== 'yes') {
  log.error(
    'refusing to run without KARWAN_RESTORE_CONFIRM=yes. Restore wipes current state.',
  );
  process.exit(1);
}

const DATABASE_URL = required('DATABASE_URL');
const B2_KEY_ID = required('B2_KEY_ID');
const B2_APPLICATION_KEY = required('B2_APPLICATION_KEY');
const B2_BUCKET = required('B2_BUCKET');
const B2_ENDPOINT = required('B2_ENDPOINT');
const B2_REGION = required('B2_REGION');

const SKIP_DB = env.KARWAN_RESTORE_SKIP_DB === '1';
const PINNED_STAMP = env.KARWAN_RESTORE_STAMP ?? '';
const DATA_DIR = env.KARWAN_BACKUP_DATA_DIR ?? '/app/backend/data';

const s3 = new S3Client({
  region: B2_REGION,
  endpoint: B2_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: B2_KEY_ID,
    secretAccessKey: B2_APPLICATION_KEY,
  },
});

async function listLatestKey(prefix: string): Promise<string | null> {
  if (PINNED_STAMP) {
    const ext = prefix === 'db/' ? '.sql.gz' : '.tar.gz';
    return `${prefix}${PINNED_STAMP}${ext}`;
  }
  let continuationToken: string | undefined;
  let latest: _Object | null = null;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: B2_BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    for (const obj of res.Contents ?? []) {
      if (!obj.Key || !obj.LastModified) continue;
      if (!latest || obj.LastModified > (latest.LastModified as Date)) latest = obj;
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);
  return latest?.Key ?? null;
}

async function downloadToFile(key: string, outPath: string): Promise<void> {
  log.info({ key, outPath }, 'download start');
  const res = await s3.send(new GetObjectCommand({ Bucket: B2_BUCKET, Key: key }));
  if (!res.Body) throw new Error(`empty response for ${key}`);
  const ws = createWriteStream(outPath);
  await pipeline(res.Body as Readable, ws);
  log.info({ key }, 'download ok');
}

async function restoreDb(dumpGzPath: string): Promise<void> {
  log.info({ dumpGzPath }, 'psql restore start');
  const gunzip = spawn('gunzip', ['-c', dumpGzPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const psql = spawn('psql', [DATABASE_URL], {
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  // Pipe gunzip stdout into psql stdin.
  gunzip.stdout.pipe(psql.stdin);

  const wait = (name: string, p: ChildProcess): Promise<number> =>
    new Promise((res, rej) => {
      p.on('error', (e) => rej(new Error(`${name}: ${e.message}`)));
      p.on('exit', (c) => res(c ?? -1));
    });
  const [gzCode, psqlCode] = await Promise.all([wait('gunzip', gunzip), wait('psql', psql)]);
  if (gzCode !== 0) throw new Error(`gunzip exited ${gzCode}`);
  if (psqlCode !== 0) throw new Error(`psql exited ${psqlCode}`);
  log.info('psql restore ok');
}

async function restoreData(tarGzPath: string): Promise<void> {
  log.info({ tarGzPath, dataDir: DATA_DIR }, 'tar restore start');
  // Extract to /app/backend so the archive's data/ lands at /app/backend/data.
  mkdirSync('/app/backend', { recursive: true });
  const tar = spawn('tar', ['-xzf', tarGzPath, '-C', '/app/backend'], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const stderr: string[] = [];
  tar.stderr.on('data', (c) => stderr.push(c.toString()));
  const code: number = await new Promise((res, rej) => {
    tar.on('error', rej);
    tar.on('exit', res);
  });
  if (code !== 0) {
    log.error({ code, stderr: stderr.join('') }, 'tar restore failed');
    throw new Error(`tar exited ${code}`);
  }
  log.info('tar restore ok');
}

async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'karwan-restore-'));
  try {
    if (!SKIP_DB) {
      const dbKey = await listLatestKey('db/');
      if (!dbKey) {
        log.warn('no db snapshots found in bucket; skipping db restore');
      } else {
        const dbFile = join(dir, 'restore.sql.gz');
        await downloadToFile(dbKey, dbFile);
        await restoreDb(dbFile);
      }
    } else {
      log.info('KARWAN_RESTORE_SKIP_DB=1; skipping db restore');
    }

    const dataKey = await listLatestKey('data/');
    if (!dataKey) {
      log.warn('no data snapshots found in bucket; skipping data restore');
    } else {
      const dataFile = join(dir, 'restore.tar.gz');
      await downloadToFile(dataKey, dataFile);
      await restoreData(dataFile);
    }

    log.info({ bucket: B2_BUCKET }, 'restore complete');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  log.error({ err: (err as Error).message }, 'restore crashed');
  process.exit(1);
});
