import { z } from 'zod';

import { resolveBuyerProfileForUser, resolveSellerProfile } from '../agents/agent-registry.js';
import { getAgentWallets } from '../db/agentWallets.js';
import { findListingBySeedKey, createListing } from '../db/listings.js';
import { getUserByEmail } from '../db/users.js';
import { accountTypeOf, deriveLane } from '../profile/accountType.js';
import { postManagedJob } from '../marketplace/postManagedJob.js';
import {
  selectMarketplaceSeedItems,
  type MarketplaceSeedItem,
} from '../marketplace/marketplaceSeedCatalog.js';

const CONFIRMATION = 'I_UNDERSTAND_REAL_TESTNET';
const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

type SeedKind = 'request' | 'offer' | 'all';

type SeedOptions = {
  email: string;
  kind: SeedKind;
  limit?: number;
  apply: boolean;
};

function readOptions(argv: string[]): SeedOptions {
  let email = process.env.MARKET_SEED_EMAIL ?? '';
  let kind: SeedKind = 'all';
  let limit: number | undefined;
  let apply = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--email') {
      email = argv[++index] ?? '';
    } else if (arg === '--kind') {
      const value = argv[++index];
      if (value !== 'request' && value !== 'offer' && value !== 'all') {
        throw new Error('--kind must be request, offer, or all');
      }
      kind = value;
    } else if (arg === '--limit') {
      const value = Number(argv[++index]);
      if (!Number.isInteger(value) || value < 1 || value > 40) {
        throw new Error('--limit must be a whole number between 1 and 40');
      }
      limit = value;
    } else if (arg === '--apply') {
      apply = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: npm run market:seed -- --email <account email> [--kind request|offer|all] [--limit N] [--apply]',
      );
      process.exit(0);
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }

  if (!email.trim()) throw new Error('--email or MARKET_SEED_EMAIL is required');
  return { email: email.trim().toLowerCase(), kind, limit, apply };
}

function describeItem(item: MarketplaceSeedItem): Record<string, unknown> {
  if (item.kind === 'request') {
    return {
      seedKey: item.seedKey,
      kind: item.kind,
      budgetUsdc: item.budgetUsdc,
      deadlineDays: item.deadlineDays,
      creation: 'real Arc JobBoard post plus durable brief metadata',
    };
  }
  return {
    seedKey: item.seedKey,
    kind: item.kind,
    title: item.title,
    askingPriceUsdc: item.askingPriceUsdc,
    creation: 'durable Karwan marketplace offer',
  };
}

async function run(options: SeedOptions): Promise<void> {
  const items = selectMarketplaceSeedItems(options.kind, options.limit);
  const account = getUserByEmail(options.email);
  if (!account) throw new Error(`no Karwan account found for ${options.email}`);
  const address = addressSchema.parse(account.address);
  const agents = await getAgentWallets(address);

  const buyerProfile = options.kind !== 'offer' && agents ? await resolveBuyerProfileForUser(address) : null;
  const sellerProfile = options.kind !== 'request' && agents ? await resolveSellerProfile(agents.sellerAddress) : null;

  const summary = {
    mode: options.apply ? 'apply' : 'dry-run',
    accountEmail: options.email,
    accountAddress: address,
    itemCount: items.length,
    agentsActivated: agents !== null,
    buyerAgentReady: buyerProfile !== null,
    sellerAgentReady: sellerProfile !== null,
    items: items.map(describeItem),
  };

  if (!options.apply) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  if (!agents) throw new Error('the account has no activated buyer and seller agents');
  if (process.env.MARKET_SEED_CONFIRM !== CONFIRMATION) {
    throw new Error(`set MARKET_SEED_CONFIRM=${CONFIRMATION} to authorize real testnet posts`);
  }
  if (options.kind !== 'offer' && !buyerProfile) {
    throw new Error('buyer profile is not ready; no on-chain requests were posted');
  }
  if (options.kind !== 'request' && !sellerProfile) {
    throw new Error('seller profile is not ready; no offers were created');
  }

  const results: Array<Record<string, unknown>> = [];
  const sellerAccountType = await accountTypeOf(address);

  for (const item of items) {
    if (item.kind === 'request') {
      const result = await postManagedJob(
        {
          posterAddress: address,
          brief: item.brief,
          budgetUsdc: item.budgetUsdc,
          deadlineDays: item.deadlineDays,
        },
        { seedKey: item.seedKey },
      );
      if (!result.ok) {
        results.push({ seedKey: item.seedKey, kind: item.kind, status: 'failed', ...result.body });
        break;
      }
      results.push({
        seedKey: item.seedKey,
        kind: item.kind,
        status: result.reused ? 'already-present' : 'created',
        jobId: result.jobId,
        ...(result.result ? { txHash: result.result.txHash } : {}),
      });
      continue;
    }

    const existing = findListingBySeedKey(item.seedKey);
    if (existing) {
      results.push({ seedKey: item.seedKey, kind: item.kind, status: 'already-present', listingId: existing.id });
      continue;
    }
    const listing = createListing({
      seedKey: item.seedKey,
      sellerUser: address,
      sellerAgent: agents.sellerAddress,
      title: item.title,
      description: item.description,
      askingPriceUsdc: item.askingPriceUsdc,
      ttlDays: item.ttlDays,
      tradeLane: deriveLane(sellerAccountType),
      partyKind: sellerAccountType,
    });
    results.push({ seedKey: item.seedKey, kind: item.kind, status: 'created', listingId: listing.id });
  }

  console.log(JSON.stringify({ ...summary, results }, null, 2));
}

try {
  await run(readOptions(process.argv.slice(2)));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
