import { redirect } from 'next/navigation';

/// The agent's money, with its top up and withdraw, lives on Money > Agent (view 83).
export default function Page() {
  redirect('/account?tab=agent');
}
