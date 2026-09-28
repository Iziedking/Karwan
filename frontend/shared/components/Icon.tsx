import React, { type SVGProps } from 'react';
import {
  Activity, ArrowLeftRight, ArrowRight, ArrowUpRight, BriefcaseBusiness,
  ChevronLeft, ChevronRight, Coins, FileText, Globe, Link, List,
  LoaderCircle, UserRound, Wallet,
} from 'lucide-react';

const icons = {
  activity: Activity,
  'arrow-left-right': ArrowLeftRight,
  'arrow-right': ArrowRight,
  'arrow-up-right': ArrowUpRight,
  briefcase: BriefcaseBusiness,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  coins: Coins,
  'file-text': FileText,
  globe: Globe,
  link: Link,
  list: List,
  'loader-circle': LoaderCircle,
  user: UserRound,
  wallet: Wallet,
} as const;

export type IconName = keyof typeof icons;
export type IconSize = 16 | 20 | 24;
export type IconProps = Omit<SVGProps<SVGSVGElement>,
  'name' | 'width' | 'height' | 'strokeWidth' | 'strokeLinecap' | 'strokeLinejoin'> & {
  name: IconName;
  size?: IconSize;
  directional?: boolean;
  label?: string;
};

export function Icon({ name, size = 20, directional = false, label, className, ...props }: IconProps) {
  const Glyph = icons[name];
  return (
    <Glyph
      {...props}
      className={[className, directional ? 'rtl:rotate-180' : undefined].filter(Boolean).join(' ')}
      width={size}
      height={size}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
      focusable="false"
    />
  );
}

function legacy(name: IconName) {
  return function LegacyIcon(props: SVGProps<SVGSVGElement>) {
    const { width, height, strokeWidth, strokeLinecap, strokeLinejoin, 'aria-label': label, ...rest } = props;
    const requested = Number(width ?? height ?? 16);
    const size: IconSize = requested >= 24 ? 24 : requested >= 20 ? 20 : 16;
    return <Icon {...rest} name={name} size={size} label={label} />;
  };
}

export const GlobeIcon = legacy('globe');
export const CoinIcon = legacy('coins');
export const BuyerIcon = legacy('user');
export const SellerIcon = legacy('briefcase');
export const WalletIcon = legacy('wallet');
export const FlowIcon = legacy('arrow-left-right');
export const PulseIcon = legacy('activity');
export const ListIcon = legacy('list');
export const ContractIcon = legacy('file-text');
export const ChainIcon = legacy('link');
