import type { IssueSection, SectionKey } from '@/core/api';

export interface MarkdownNewsletterDraft {
  subject: string;
  preheader: string;
  sections: IssueSection[];
  warnings: string[];
}

type HeadingBlock = {
  depth: number;
  title: string;
  body: string;
};

const SECTION_HEADINGS: Record<SectionKey, string> = {
  shipped: 'what shipped',
  ecosystem: 'the karwan ecosystem',
  learned: 'what we are preparing for next',
};

function cleanTitle(value: string): string {
  return value.replace(/\s+#*\s*$/, '').trim();
}

function blocksFromMarkdown(source: string): HeadingBlock[] {
  const lines = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const blocks: HeadingBlock[] = [];
  let current: { depth: number; title: string; body: string[] } | null = null;

  const flush = () => {
    if (!current) return;
    blocks.push({ depth: current.depth, title: current.title, body: current.body.join('\n').trim() });
  };

  for (const line of lines) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (match) {
      flush();
      current = { depth: match[1].length, title: cleanTitle(match[2]), body: [] };
      continue;
    }
    current?.body.push(line);
  }
  flush();
  return blocks;
}

function firstParagraph(body: string): string {
  return body
    .split(/\n\s*\n/)
    .map((part) => part.replace(/^[-*]\s+/, '').trim())
    .find(Boolean) ?? '';
}

function subjectFromOptions(body: string, fallback: string): string {
  const option = body
    .split('\n')
    .map((line) => line.trim())
    .map((line) => /^(?:\d+[.)]|[-*])\s+(.+)$/.exec(line)?.[1]?.trim() ?? '')
    .find(Boolean);
  return option || fallback;
}

function bucketFor(title: string): SectionKey {
  const value = title.toLowerCase();
  if (/evidence|preparing|next|important|learn|testnet|mainnet|proof|note/.test(value)) return 'learned';
  if (/changed|current build|workflow|shipped|feature|try|today/.test(value)) return 'shipped';
  return 'ecosystem';
}

function sectionBody(blocks: HeadingBlock[]): string {
  return blocks
    .filter((block) => block.body.trim())
    .map((block) => `**${block.title}**\n\n${block.body.trim()}`)
    .join('\n\n')
    .trim();
}

export function parseMarkdownNewsletter(filename: string, source: string): MarkdownNewsletterDraft {
  const blocks = blocksFromMarkdown(source);
  const warnings: string[] = [];
  const title = blocks.find((block) => block.depth === 1)?.title ?? '';
  const subjectOptions = blocks.find((block) => /subject line options/i.test(block.title));
  const previewText = blocks.find((block) => /preview text/i.test(block.title));
  const copyStart = blocks.findIndex((block) => /newsletter copy/i.test(block.title));
  const footerIndex = blocks.findIndex((block) => /publisher footer/i.test(block.title));
  const copyBlocks = blocks
    .slice(copyStart >= 0 ? copyStart + 1 : 0, footerIndex >= 0 ? footerIndex : blocks.length)
    .filter((block) => !/publishing metadata|subject line options|preview text/i.test(block.title));

  const subject = subjectFromOptions(subjectOptions?.body ?? '', title);
  const preheader = firstParagraph(previewText?.body ?? '');
  if (!subject) warnings.push('No subject line was found. Add one before saving.');
  if (!preheader) warnings.push('No preview text was found. Add one before saving.');
  if (!copyBlocks.length) warnings.push('No newsletter sections were found. Use level-three headings for the copy.');
  if (footerIndex >= 0) warnings.push('The publisher footer was omitted. Sending adds the configured unsubscribe footer.');
  if (filename && !/\.md(?:own)?$/i.test(filename)) warnings.push('This file is not a Markdown document.');

  const grouped = new Map<SectionKey, HeadingBlock[]>([
    ['shipped', []],
    ['ecosystem', []],
    ['learned', []],
  ]);
  for (const block of copyBlocks) grouped.get(bucketFor(block.title))?.push(block);

  const sections = (['shipped', 'ecosystem', 'learned'] as const).map((key) => {
    const body = sectionBody(grouped.get(key) ?? []);
    if (!body) warnings.push(`The ${key} section is empty.`);
    const limited = body.slice(0, 20_000);
    if (limited.length < body.length) warnings.push(`The ${key} section was trimmed to 20,000 characters.`);
    return { key, heading: SECTION_HEADINGS[key], body: limited, signalIds: [] };
  });

  return { subject: subject.slice(0, 200), preheader: preheader.slice(0, 300), sections, warnings };
}
