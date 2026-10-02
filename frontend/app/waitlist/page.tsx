import { StartScreen } from '@/features/signup/components/StartScreen';
import { SignInMedia } from '@/features/signup/components/SignInMedia';

/// The mainnet waitlist, linked from the testnet sign-in page and shareable on
/// its own. Same layout as /start, opened on the waitlist card.
export default function WaitlistPage() {
  return (
    <div className="w-full bg-[var(--canvas)]">
      <div className="grid min-h-[calc(100svh-var(--lp-nav-h,72px))] w-full gap-6 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:px-6">
        <div className="flex min-w-0 items-center justify-center">
          <div className="w-full max-w-[440px]">
            <StartScreen mode="waitlist" />
          </div>
        </div>
        <SignInMedia />
      </div>
    </div>
  );
}
