import { StartScreen } from '@/features/signup/components/StartScreen';
import { SignInMedia } from '@/features/signup/components/SignInMedia';

export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const mode = query.mode === 'signup' ? 'signup' : 'signin';
  return (
    <div className="w-full bg-[var(--canvas)]">
      <div className="grid min-h-[calc(100svh-var(--lp-nav-h,72px))] w-full gap-6 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:px-6">
        <div className="flex min-w-0 items-center justify-center">
          <div className="w-full max-w-[440px]">
            <StartScreen mode={mode} />
          </div>
        </div>
        <SignInMedia />
      </div>
    </div>
  );
}
