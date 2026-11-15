import { redirect } from 'next/navigation';

/// The savings pocket has its own page (view 82); old links still land there.
export default function StakePage() {
  redirect('/pocket');
}
