import { StartScreen } from '@/features/signup/components/StartScreen';
import { SignInStage } from '@/features/signup/components/SignInStage';

/// The mainnet waitlist, linked from the testnet sign-in page and shareable on
/// its own. Same stage as /start, opened on the waitlist card.
export default function WaitlistPage() {
  return (
    <SignInStage>
      <StartScreen mode="waitlist" />
    </SignInStage>
  );
}
