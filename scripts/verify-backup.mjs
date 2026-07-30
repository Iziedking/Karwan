#!/usr/bin/env node
// Verify the newest Backblaze B2 backup is complete and restorable, WITHOUT
// restoring it. Read-only: lists the bucket, downloads the newest db snapshot
// to the container's /tmp, and reports what is inside.
//
//   scp scripts/verify-backup.mjs karwan-vm:/tmp/
//   ssh karwan-vm 'cd ~/karwan && docker compose exec -T karwan-api node - < /tmp/verify-backup.mjs'
//
// Piped over stdin rather than baked into the image so it can be run against a
// container that predates it. Credentials come from the container env, so they
// never appear on a command line or in shell history.
//
// A "uploaded" line in the backup log proves a PUT succeeded, not that the
// artefact is usable. A truncated pg_dump uploads perfectly happily, and you
// find out during an outage. This is the check that would catch it.

import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { spawn } from 'node:child_process';

const s3 = new S3Client({
  region: process.env.B2_REGION,
  endpoint: process.env.B2_ENDPOINT,
  credentials: { accessKeyId: process.env.B2_KEY_ID, secretAccessKey: process.env.B2_APPLICATION_KEY },
});
const BUCKET = process.env.B2_BUCKET;

for (const prefix of ['db/', 'data/', 'env/', 'crontab/']) {
  const r = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix }));
  const objs = (r.Contents ?? []).sort((a, b) => +b.LastModified - +a.LastModified);
  console.log(`${prefix.padEnd(10)} ${String(objs.length).padStart(3)} objects, newest ${objs[0]?.Key} (${objs[0]?.LastModified?.toISOString()}, ${objs[0]?.Size} B)`);
}

const list = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: 'db/' }));
const newest = (list.Contents ?? []).sort((a, b) => +b.LastModified - +a.LastModified)[0];
console.log(`\n=== inspecting ${newest.Key}`);
const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: newest.Key }));
await pipeline(obj.Body, createGunzip(), createWriteStream('/tmp/verify.sql'));

// The completion marker is NOT on the last line. Postgres 17 appends an
// `\unrestrict <token>` line after it, so checking `tail -1` (or -3) reports a
// false negative on a perfectly good dump, which is worse than no check at all:
// it sends you hunting a truncation that never happened. Grep the whole file.
const report = spawn('sh', ['-c',
  'echo "dump: $(wc -c < /tmp/verify.sql) bytes, $(wc -l < /tmp/verify.sql) lines, ' +
  '$(grep -c "^COPY " /tmp/verify.sql) COPY blocks"; ' +
  'missing=0; ' +
  'for t in direct_deals profiles agent_wallets team_members oauth_clients team_access_keys ' +
  'app_snapshots event_history bridges telegram_links users; do ' +
  'grep -q "CREATE TABLE public.\\"\\?$t" /tmp/verify.sql || { echo "  MISSING TABLE: $t"; missing=1; }; done; ' +
  '[ $missing -eq 0 ] && echo "critical tables: all present"; ' +
  'if grep -q "PostgreSQL database dump complete" /tmp/verify.sql; then echo "completion marker: present"; ' +
  'else echo "completion marker: ABSENT - THE DUMP IS TRUNCATED, DO NOT RELY ON THIS BACKUP"; fi; ' +
  'rm -f /tmp/verify.sql'],
  { stdio: 'inherit' });
await new Promise((r) => report.on('close', r));
