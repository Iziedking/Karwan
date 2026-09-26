import { DealBackdrop } from '@/features/signup/components/DealBackdrop';
import { AuthCard } from '@/features/signup/components/AuthCard';

export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const mode = query.mode === 'signup' ? 'signup' : 'signin';
  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[var(--lp-bg)]">
      <DealBackdrop />
      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-[460px] flex-col justify-center px-4 py-12">
        <AuthCard initialMode={mode} />
      </div>
    </main>
  );
}
