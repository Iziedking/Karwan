import {
  Activity, ArrowLeftRight, Bot, Building, CircleAlert, ClipboardList, Code, House, Inbox, KeyRound, Landmark, LifeBuoy, Mail,
  Megaphone, MessageSquareText, MessagesSquare, Handshake, Scale, ScrollText, Settings, ShieldCheck, Shuffle, Users,
  type LucideIcon,
} from 'lucide-react';
import type { DeskIcon as DeskIconName } from '@/features/admin/adminNavigation';

const ICONS: Record<DeskIconName, LucideIcon> = {
  home: House,
  inbox: Inbox,
  life: LifeBuoy,
  chat: MessagesSquare,
  users: Users,
  building: Building,
  clipboard: ClipboardList,
  megaphone: Megaphone,
  mail: Mail,
  feedback: MessageSquareText,
  deal: Handshake,
  scale: Scale,
  arrows: ArrowLeftRight,
  landmark: Landmark,
  shuffle: Shuffle,
  bot: Bot,
  activity: Activity,
  alert: CircleAlert,
  history: ScrollText,
  code: Code,
  shield: ShieldCheck,
  key: KeyRound,
  settings: Settings,
};

export function DeskIcon({ name, className }: { name: DeskIconName; className?: string }) {
  const Icon = ICONS[name];
  return <Icon aria-hidden="true" strokeWidth={1.5} className={className ?? 'size-[15px]'} />;
}
