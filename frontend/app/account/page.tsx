import { MoneyHome } from '@/features/money/components/MoneyHome';
import { ProfileGate } from '@/features/account/ProfileGate';

/// The money page (view 44). An old ?money=v1 link opens it too.
export default function AccountPage() {
  return (
    <>
      <ProfileGate />
      <MoneyHome />
    </>
  );
}
