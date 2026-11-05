/// Where money pages live (view 51, fourth and fifth rounds). Add money and
/// Withdraw are pages; the old `/bridge` links still land on them.

export type MoneyTab = 'balance' | 'agent' | 'guarantee';

export const ADD_HREF = '/add';
export const WITHDRAW_HREF = '/withdraw';

export function moneyTab(value: string | null | undefined): MoneyTab {
  return value === 'agent' || value === 'agents' ? 'agent' : value === 'guarantee' ? 'guarantee' : 'balance';
}

export function moneyHref(tab: MoneyTab): string {
  return tab === 'balance' ? '/account' : `/account?tab=${tab}`;
}

/// An old Add or Withdraw link (`/bridge?direction=in|out`) that now has its
/// own page. A public payment link (`?recipient=`), a named rail, the
/// cross-network intents and a bare `/bridge` keep the bridge page.
export function bridgeRedirect(params: URLSearchParams): string | null {
  if (params.get('recipient') || params.get('rail') || params.get('intent')) return null;
  const direction = params.get('direction');
  if (direction === 'out') {
    const q = new URLSearchParams();
    for (const key of ['amount', 'to']) {
      const value = params.get(key);
      if (value) q.set(key, value);
    }
    const rest = q.toString();
    return rest ? `${WITHDRAW_HREF}?${rest}` : WITHDRAW_HREF;
  }
  if (direction === 'in') return ADD_HREF;
  return null;
}

export type MoneyAgentMove = 'topUp' | 'withdraw';

export function agentMoveHref(move: MoneyAgentMove, agent: 'buyer' | 'seller' = 'buyer'): string {
  return `/account/agent?move=${move}&agent=${agent}`;
}

export function guaranteeStepHref(step: 'put_up' | 'take_out'): string {
  return `/account/guarantee?step=${step}`;
}

/// Leaving a money page goes back where the person came from, or to Money.
export function leaveMoneyPage(router: { back: () => void; push: (href: string) => void }, fallback = '/account'): void {
  if (typeof window !== 'undefined' && window.history.length > 1 && document.referrer.startsWith(window.location.origin)) router.back();
  else router.push(fallback);
}
