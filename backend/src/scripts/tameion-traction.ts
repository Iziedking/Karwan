import { ARC } from '../chain/client.js';
import { listAllDeals } from '../db/deals.js';
import { listRecords } from '../db/evidence.js';
import { postgresExecutor, pgEnabled } from '../db/client.js';
import type { TelegramAccount } from '../db/telegramAccounts.js';
import type { WhatsappAccount } from '../db/whatsapp.js';
import type { ConfirmRequest } from '../verification/clientConfirm.js';
import type { StoredFact } from '../verification/evidence.js';
import { levelOf } from '../verification/live.js';

/// Read-only counts for the Tameion submission, for the network this process
/// runs on. Everything counted comes from real chat accounts, which only exist
/// when a person messages the agent on Telegram or WhatsApp and accepts the
/// terms. Web accounts that linked Telegram are counted on their own line.
///
///   node dist/scripts/tameion-traction.js

if (!pgEnabled) {
  console.error('traction needs the Postgres store (DATABASE_URL)');
  process.exit(2);
}

const whatsapp = (await postgresExecutor().query<{ data: WhatsappAccount }>('SELECT data FROM whatsapp_accounts')).rows.map((r) => r.data);
const telegram = (await postgresExecutor().query<{ data: TelegramAccount }>('SELECT data FROM telegram_accounts')).rows.map((r) => r.data);
const active = (a: { address: string | null; activated?: boolean }) => !!a.address && !!a.activated;
const telegramChat = telegram.filter((a) => active(a) && !a.linkedWebAccount);
const telegramLinked = telegram.filter((a) => a.linkedWebAccount);
const accounts = [...whatsapp.filter(active), ...telegramChat];
const chatAddresses = new Set(accounts.map((a) => a.address!.toLowerCase()));

const levels: Record<string, number> = { registered: 0, person_verified: 0, work_verified: 0, id_verified: 0 };
for (const a of accounts) {
  const level = await levelOf(a.address!);
  levels[level] = (levels[level] ?? 0) + 1;
}

const facts = (await listRecords<StoredFact[]>('facts')).flatMap((r) => r.data);
const confirmations = (await listRecords<ConfirmRequest>('confirm')).map((r) => r.data);

const deals = (await listAllDeals()).filter(
  (d) => chatAddresses.has(d.buyer.toLowerCase()) || chatAddresses.has(d.seller.toLowerCase()),
);
const funded = deals.filter((d) => d.fundTxHash || d.acceptedAt);
const settled = deals.filter((d) => d.settledAt && !d.cancelledAt);
const usdc = (list: typeof deals) => list.reduce((sum, d) => sum + Number(d.dealAmountUsdc || 0), 0);

console.log(
  JSON.stringify(
    {
      network: ARC.name,
      chatAccounts: accounts.length,
      byChannel: { telegram: telegramChat.length, whatsapp: accounts.length - telegramChat.length },
      webAccountsUsingTelegram: telegramLinked.length,
      levels,
      verifiedFacts: facts.length,
      factsOnArc: facts.filter((f) => f.onchain).length,
      clientConfirmations: {
        asked: confirmations.length,
        confirmed: confirmations.filter((c) => c.status === 'yes').length,
        declined: confirmations.filter((c) => c.status === 'no').length,
      },
      deals: {
        started: deals.length,
        funded: funded.length,
        settled: settled.length,
        usdcFunded: Math.round(usdc(funded) * 100) / 100,
        usdcSettled: Math.round(usdc(settled) * 100) / 100,
      },
    },
    null,
    2,
  ),
);
process.exit(0);
