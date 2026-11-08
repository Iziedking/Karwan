# Dependency advisories

Reviewed 8 November 2026. Next review by 8 December 2026, or sooner when CI fails.

The source is `npm audit --omit=dev` on the root `package-lock.json`, which the frontend, the backend and the backend image all install from. `npm run check:audit` (in `frontend/`, and in CI) fails on any critical or high advisory that is not listed below, or is listed with a review date that has passed. The machine copy of this table is `audit-accepted.json` beside this file.

## State on 8 November 2026

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 7 advisories, in 3 packages, reported against 56 packages that depend on them |
| Moderate | 17 |
| Low | 13 |

Fixed in this review: `next` 15.5.24 to 15.5.29 (GHSA-4jqv-mc3x-m676 and GHSA-mcj8-r9mp-w47p, cache poisoning of SSG and ISR pages), `follow-redirects` 1.16.2, `undici` 6.29.1 and `ws` 8.22.1, through `overrides` in the root `package.json`.

## Accepted for now

### zod 3 (GHSA-mrhx-c7xc-m3w5)

- **How it gets in.** The backend validates every request with zod 3 (`backend/package.json`). The Circle kits pin zod 3.25.67, `@reown/appkit-wallet` pins 3.22.4, and `@coinbase/cdp-sdk` asks for 3.
- **Reach.** Yes. Our route schemas parse request bodies from the internet. The advisory needs a very large collection checked against a size rule.
- **What stops it.** Every API request body is capped at 20 MB before parsing (`backend/src/middleware/requestSize.ts`). The busiest public routes are rate limited.
- **Fixed in.** zod 4.6.6. Moving the backend means rewriting every route schema; the kits move when Circle ships them on zod 4.
- **Owner.** Founder. **Review by** 8 December 2026.

### toml (GHSA-82x6-q7mm-w9cf, GHSA-v5mp-jgw5-2x6j, GHSA-4qx8-w7c3-pj3p, GHSA-9j65-hcg3-gc64, GHSA-9qmh-m7c6-f92p)

- **How it gets in.** `@coral-xyz/anchor` 0.32 asks for toml 3. Anchor comes in with the Circle kits: `app-kit`, `swap-kit`, `unified-balance-kit`, `adapter-solana-kit` and the CCTP, Gateway and swap providers.
- **Reach.** No. Anchor parses TOML only when code reads `anchor.workspace`, which reads `Anchor.toml` from the working directory. Karwan never reads it, and no request reaches a TOML parser.
- **What stops it.** Nothing has to. The parser is not called.
- **Fixed in.** No fixed toml release exists (every version up to 5.0.0 is listed). Waiting for Anchor or the Circle kits to drop it.
- **Owner.** Founder. **Review by** 8 December 2026.

### decode-uri-component (GHSA-qr28-fpjm-wq7f)

- **How it gets in.** `query-string` 7, used by `@walletconnect/utils` inside Reown and wagmi 2, in the browser.
- **Reach.** Only in the visitor's own browser, while it reads a wallet connection link. It never runs on our servers. The worst case is a slow tab for the person who opened a crafted link.
- **What stops it.** It cannot touch the API or other people's data.
- **Fixed in.** `@walletconnect/utils` 2.26.0 no longer uses `query-string`. It reaches us with the wagmi 3 and Reown upgrade, a separate stage after mainnet signs. The fixed `decode-uri-component` releases are ES modules only and cannot be forced under `query-string` 7.
- **Owner.** Founder. **Review by** 8 December 2026.

## Not taken in this review

| Upgrade | Why not now |
|---|---|
| Next.js 16 | A major. Needs its own regression stage. |
| Circle kits on a new major | npm offers `@circle-fin/app-kit` 1.0.0, older than our 1.15.2. No fixed 1.x exists. A kit change is money code and starts with the Arc and Circle check in `docs/arc-circle-checks.md`. |
| wagmi 3 and Reown | A wallet connection major, after mainnet signs. |
| zod 4 in the backend | Every route schema moves. Covered by the request size cap until then. |

## Housekeeping

`backend/package-lock.json` has not changed since 9 June 2026 and nothing installs from it: the Dockerfile and CI both use the root lockfile with `--workspace=backend`. Its own audit numbers describe packages that never ship, so the gate ignores it.
