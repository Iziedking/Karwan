import { redirect } from 'next/navigation';

/// The public numbers live in the docs now; old and shared links land there.
export default function AllTimeRedirect() {
  redirect('/docs/numbers');
}
