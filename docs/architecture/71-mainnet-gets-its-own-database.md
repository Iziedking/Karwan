# 71 · Mainnet gets its own database

Track: foundation (security and operations). Covers audit item S-07 (plan item 15). Approved 8 Nov 2026 as drafted. Rehearsed the same day on throwaway containers: 2 s for the copy and checks.

## What is wrong today

Read from karwan-vm on 8 November 2026:

| | Today |
|---|---|
| Postgres | One container, `karwan-postgres` (postgres 17.11), one volume `karwan_pgdata`, two databases: `karwan` (testnet) and `karwan_mainnet`. |
| Who can reach it | Every container on the one compose network, testnet and mainnet alike. |
| Mainnet data | 13 MB. 132 waitlist sign-ups, 138 survey answers, 2 profiles, 1 passkey account, 1 recovery backup, 63 migrations. |
| Backup | `backup-mainnet.sh`, nightly at 03:37 UTC, encrypted to S3. It dumps `karwan_mainnet` as the shared superuser `karwan`. Last run 8 Nov, complete. |

A runaway testnet query, a full disk, or a bad Postgres upgrade on testnet takes mainnet down with it. The testnet superuser can read mainnet.

## The idea in one line

Mainnet gets its own Postgres container, volume and network. Only the mainnet API can reach it, and testnet cannot see it at all.

## After the move

```mermaid
flowchart LR
  subgraph default[network: default]
    C[caddy] --> T[karwan-api]
    C --> M[karwan-api-mainnet]
    T --> PT[(karwan-postgres: testnet)]
  end
  subgraph mainnet[network: mainnet, internal]
    M --> PM[(karwan-postgres-mainnet)]
  end
  B[backup-mainnet.sh, 03:37 UTC] --> PM
  B --> S3[(S3, encrypted)]
```

1. **New service `postgres-mainnet`** in `docker-compose.yml`, behind the `mainnet` profile: postgres 17-alpine, container `karwan-postgres-mainnet`, volume `karwan_pgdata_mainnet`, on an internal network `mainnet` only. Its admin user is `postgres`, with a password from a new `POSTGRES_MAINNET_ADMIN_PASSWORD` in `.env`. The app keeps its own non-superuser role `karwan_mainnet` with today's password, so `.env.mainnet` only changes its host.
2. **`karwan-api-mainnet`** joins both networks (Caddy reaches it on `default`; it reaches its database on `mainnet`) and waits for `postgres-mainnet`, not the testnet one.
3. **The move, `scripts/ops/move-mainnet-db.sh`**, run by you on karwan-vm with the mainnet API stopped, so nothing is written mid-copy:
   - creates the role and database in the new container, reading the password from `.env.mainnet` without printing it;
   - `pg_dump` from the old container straight into `pg_restore` in the new one;
   - compares the row count of every table, old against new, and stops if any differ;
   - changes the host in `.env.mainnet` from `postgres` to `postgres-mainnet`, keeping a dated copy of the old file.
   Then you start the mainnet API with the deployed tag and check `/health`.
4. **Backup** reads from the new container as its admin: `backup-mainnet.sh` gets `PG_CONTAINER=karwan-postgres-mainnet` and `PG_USER=postgres` by default. You run it once by hand, then the cron carries on unchanged.
5. **Restore rehearsal.** `restore-test-mainnet.sh` on the machine with an age key, against the first backup after the move. Its log, dated after the move, closes the item. The disaster-restore notes in that script name the new container.
6. **The old copy stays a week.** `karwan_mainnet` in the testnet container is left untouched and unused, so going back is a host change and a restart. After a week with backups passing, a last script drops it and its role from the testnet container.

## What it costs

A few minutes in which mainnet answers nothing. The copy is 13 MB; in the rehearsal the copy and checks took 2 seconds, so the gap is mostly the API restarting. One more Postgres on a host with 7.8 GB, about 6 GB of it free.

## What does not change

Nothing a person can do. The guide, canon, FAQ and terms stay as they are. Testnet keeps its container, volume and data exactly as they are.

## How we know it worked

- The move script prints every table with matching counts, and `/health` on `mainnet-api.karwan.site` answers with the database up.
- From inside `karwan-api` (testnet), `postgres-mainnet` does not resolve.
- The first nightly backup after the move completes with the same number of public tables (137).
- The restore rehearsal log, dated after the move, passes with both age keys.
