import { StartScreen } from '@/features/signup/components/StartScreen';
import { SignInStage } from '@/features/signup/components/SignInStage';

export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const mode = query.mode === 'signup' ? 'signup' : 'signin';
  return (
    <SignInStage>
      <StartScreen mode={mode} />
    </SignInStage>
  );
}
