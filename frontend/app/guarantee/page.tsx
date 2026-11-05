import { redirect } from 'next/navigation';

/// The Deal guarantee lives on Money now, beside Balance and Agent (view 51,
/// fifth round). Old links, notifications and the assistant still land there.
export default function GuaranteePage() {
  redirect('/account?tab=guarantee');
}
