import { redirect } from 'next/navigation';

/// Open deals moved to Deals (view 44); old links and bookmarks land there.
export default function Page() {
  redirect('/deals');
}
