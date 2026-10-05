/// Readable names for the in-app pages the assistant points people to. A path
/// shown to a person is always a link with one of these labels, never raw text.
const ROUTE_LABELS: Array<[RegExp, string]> = [
  [/^\/buyer\?mode=direct/, 'a direct deal'],
  [/^\/buyer/, 'Find a seller'],
  [/^\/market/, 'the market'],
  [/^\/seller/, 'your offers'],
  [/^\/send/, 'Send'],
  [/^\/request/, 'Request a payment'],
  [/^\/bridge/, 'Move USDC'],
  [/^\/deposit/, 'Add USDC'],
  [/^\/account/, 'your wallet'],
  [/^\/app/, 'Home'],
  [/^\/activity/, 'your activity'],
  [/^\/profile/, 'your profile'],
  [/^\/settings/, 'Settings'],
  [/^\/stake/, 'Staking'],
  [/^\/deals\//, 'the deal'],
  [/^\/credit-passport\//, 'the passport'],
  [/^\/docs/, 'the docs'],
  [/^\/feedback/, 'Feedback'],
  [/^\/legacy/, 'earlier contracts'],
];

function labelFor(path: string): string {
  for (const [re, label] of ROUTE_LABELS) if (re.test(path)) return label;
  const last = path.split('?')[0].split('/').filter(Boolean).pop() ?? 'this page';
  return last.charAt(0).toUpperCase() + last.slice(1).replace(/-/g, ' ');
}

// A bare in-app path, optionally wrapped in bold, at the start of the text or after a space.
const BARE_PATH = /(^|\s)\*{0,2}(\/[a-z][a-z0-9-]*(?:\/[A-Za-z0-9_\-[\]]+)*(?:\?[a-z0-9=&_-]+)?)\*{0,2}(?=[\s.,;:!?)]|$)/g;

/// Tidies an assistant reply before it renders: headings become bold lines,
/// bare page paths become labelled links, and dashes become commas, so the chat
/// reads like a person wrote it rather than a document.
export function tidyAssistantText(text: string): string {
  return text
    .replace(/^#{1,6}\s+(.*)$/gm, (_, title: string) => `**${title.replace(/\*\*/g, '').trim()}**`)
    .replace(BARE_PATH, (_, lead: string, path: string) => `${lead}[${labelFor(path)}](${path})`)
    .replace(/\s*[—–]\s*/g, ', ');
}
