import { redirect } from 'next/navigation';

/// The theme is chosen in Settings, beside the language (view 83).
export default function Page() {
  redirect('/settings');
}
