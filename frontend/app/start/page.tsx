import { StartScreen } from '@/features/signup/components/StartScreen';
import { SignInStage } from '@/features/signup/components/SignInStage';
import { SetupFlow } from '@/features/setup/SetupFlow';

export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  // A new account goes on to "About you" on the same page (view 39).
  if (query.step === 'about') return <SetupFlow embedded />;
  const mode = query.mode === 'signup' ? 'signup' : 'signin';
  return (
    <SignInStage>
      <StartScreen mode={mode} />
    </SignInStage>
  );
}
