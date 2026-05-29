import {
  FullBleed,
  Band,
  GridOverlay,
  SectionTag,
  HeroHeadline,
  Punc,
  Accent,
} from '@/shared/components/Bands';
import { TermsContent } from '@/shared/components/TermsContent';

export const metadata = {
  title: 'Karwan terms and conditions',
  description: 'What Karwan does, what we store, and what you carry when you use the platform.',
};

export default function TermsPage() {
  return (
    <FullBleed>
      <Band tone="dark" overlay={<GridOverlay />}>
        <SectionTag tone="dark">TERMS</SectionTag>
        <HeroHeadline size="md">
          What you sign up for, in <Accent>plain</Accent> English<Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-6 text-[15px] text-[var(--lp-text-muted)] leading-relaxed max-w-[58ch]">
          The product is testnet today. The terms cover the shape of the work, the risks of
          stablecoin settlement, and what we do with your data. Read once, signed once.
        </p>
      </Band>

      <Band tone="light" compact>
        <div className="max-w-[72ch]">
          <TermsContent />
        </div>
      </Band>
    </FullBleed>
  );
}
