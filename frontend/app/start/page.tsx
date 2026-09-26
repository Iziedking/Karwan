import { DealBackdrop } from '@/features/signup/components/DealBackdrop';
import { StartScreen } from '@/features/signup/components/StartScreen';

export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const mode = query.mode === 'signup' ? 'signup' : 'signin';
  return (
    <main className="relative ms-[calc(50%-50vw)] w-screen overflow-hidden bg-[var(--lp-bg)] min-h-[calc(100svh-var(--lp-nav-h,72px))]">
      <DealBackdrop />
      <div className="relative z-10 mx-auto flex min-h-[calc(100svh-var(--lp-nav-h,72px))] w-full max-w-[460px] flex-col justify-center px-4 py-10">
        <StartScreen mode={mode} />
      </div>
    </main>
  );
}
