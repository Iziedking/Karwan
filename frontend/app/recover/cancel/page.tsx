import { CancelRecovery } from '@/features/recovery/components/CancelRecovery';

/// Where the "cancel it now" link in recovery emails lands. Works signed out.
export default async function CancelRecoveryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const token = typeof query.token === 'string' ? query.token : '';
  return (
    <main className="relative ms-[calc(50%-50vw)] w-screen bg-[var(--lp-bg)] min-h-[calc(100svh-var(--lp-nav-h,72px))]">
      <div className="mx-auto flex min-h-[calc(100svh-var(--lp-nav-h,72px))] w-full max-w-[440px] flex-col justify-center px-5 py-8 sm:max-w-[460px] sm:px-4 sm:py-10">
        <CancelRecovery token={token} />
      </div>
    </main>
  );
}
