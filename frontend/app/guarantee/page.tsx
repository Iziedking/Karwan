import { redirect } from 'next/navigation';

/// The savings pocket has its own page (view 82). Old links, notifications
/// and the assistant still land there.
export default function GuaranteePage() {
  redirect('/pocket');
}
