import { redirect } from 'next/navigation';

/// The Deal guarantee lives on Money (view 51, fifth round); old links still land there.
export default function StakePage() {
  redirect('/account?tab=guarantee');
}
