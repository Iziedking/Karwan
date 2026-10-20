/// The signed agreement is one string, written by the terms builder as
/// "Label: text" lines with milestone bullets (terms/termsCopy.ts), or typed
/// freely by a person. This splits it back into facts so the deal page can lay
/// it out to be read, without changing a word of what both sides signed.

export interface AgreementPart {
  title: string;
  /// The share and amount, when the line carries them: "50% (1,000 USDC)".
  detail?: string;
  body: string;
}

export type AgreementBlock =
  | { kind: 'fact'; label: string; body: string; parts?: AgreementPart[] }
  | { kind: 'list'; parts: AgreementPart[] }
  | { kind: 'text'; body: string };

const BULLET = /^[•\-*]\s+/;
/// A short label, then a colon. Never a link, never a long sentence.
const LABELLED = /^([^:：/]{1,40}?)\s*[:：](?!\/\/)\s*(.*)$/;

function part(line: string): AgreementPart {
  const match = line.match(LABELLED);
  const head = (match ? match[1]! : line).trim();
  const body = match ? match[2]!.trim() : '';
  const comma = head.search(/[,،]/);
  if (comma < 0) return { title: head, body };
  return { title: head.slice(0, comma).trim(), detail: head.slice(comma + 1).trim(), body };
}

export function agreementBlocks(terms: string): AgreementBlock[] {
  const blocks: AgreementBlock[] = [];
  for (const raw of terms.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (BULLET.test(line)) {
      const item = part(line.replace(BULLET, ''));
      const last = blocks[blocks.length - 1];
      if (last?.kind === 'fact') (last.parts ??= []).push(item);
      else if (last?.kind === 'list') last.parts.push(item);
      else blocks.push({ kind: 'list', parts: [item] });
      continue;
    }
    const match = line.match(LABELLED);
    if (match && /\p{L}/u.test(match[1]!)) {
      blocks.push({ kind: 'fact', label: match[1]!.trim(), body: match[2]!.trim().replace(/\s*[:：]$/, '') });
    } else {
      blocks.push({ kind: 'text', body: line });
    }
  }
  return blocks;
}
