import { AccountPageV1 } from '@/features/account/AccountPageV1';
import { MoneyHome } from '@/features/money/components/MoneyHome';
import { moneyV2Enabled } from '@/features/money/moneySwitch';

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const forced = typeof query.money === 'string' ? `?money=${query.money}` : '';
  return moneyV2Enabled(process.env.NEXT_PUBLIC_MONEY_V2, forced) ? <MoneyHome /> : <AccountPageV1 />;
}
