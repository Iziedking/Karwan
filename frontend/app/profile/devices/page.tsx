import { redirect } from 'next/navigation';

/// Signed-in devices moved into Sign-in and security (view 83).
export default function Page() {
  redirect('/profile/security');
}
