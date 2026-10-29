import { redirect } from 'next/navigation';

/// The Deal guarantee moved to /guarantee (view 37); old links still land there.
export default function StakePage() {
  redirect('/guarantee');
}
