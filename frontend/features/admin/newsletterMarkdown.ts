import type { IssueSection, SectionKey } from '@/core/api';

export interface MarkdownNewsletterDraft {
  subject: string;
  preheader: string;
  sections: IssueSection[];
  warnings: string[];
}

export type NewsletterDocumentDraft = MarkdownNewsletterDraft;

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

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;|&rsquo;/gi, "'")
    .replace(/&ldquo;|&rdquo;/gi, '"')
    .replace(/&middot;/gi, '·')
    .replace(/&rarr;/gi, '→')
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 10)));
}

function htmlToBody(source: string): string {
  return decodeHtml(
    source
      .replace(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_match, href: string, label: string) => {
        const text = label.replace(/<[^>]+>/g, '').trim();
        return text ? `[${text}](${href})` : href;
      })
      .replace(/<([a-z][\w-]*)\b[^>]*class=["'][^"']*(?:label|eyebrow)[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li[^>]*>/gi, '\n- ')
      .replace(/<\/(?:p|div|li|h[1-6]|tr|td|section|article)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  );
}

function htmlMeta(source: string, name: string): string {
  const match = new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i').exec(source);
  return decodeHtml(match?.[1] ?? '');
}

export function parseHtmlNewsletter(filename: string, source: string): NewsletterDocumentDraft {
  const warnings: string[] = [];
  const subject = htmlMeta(source, 'newsletter-subject') || decodeHtml(/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(source)?.[1] ?? '');
  const preheader = htmlMeta(source, 'newsletter-preheader');
  const sections: IssueSection[] = [];
  const sectionPattern = /<article[^>]+data-section=["'](shipped|ecosystem|learned)["'][^>]*>([\s\S]*?)<\/article>/gi;
  let match: RegExpExecArray | null;
  while ((match = sectionPattern.exec(source))) {
    const key = match[1] as SectionKey;
    const block = match[2];
    const heading = decodeHtml(/<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/i.exec(block)?.[1] ?? SECTION_HEADINGS[key]);
    const body = htmlToBody(block.replace(/<h[2-4][^>]*>[\s\S]*?<\/h[2-4]>/i, ''));
    sections.push({ key, heading, body: body.slice(0, 20_000), signalIds: [] });
  }

  if (!subject) warnings.push('No subject line was found. Add one before saving.');
  if (!preheader) warnings.push('No preview text was found. Add one before saving.');
  if (sections.length === 0) warnings.push('No marked newsletter sections were found. Use data-section attributes.');
  if (sections.length < 3) warnings.push('This HTML document does not contain all three issue sections.');
  if (filename && !/\.html?$/i.test(filename)) warnings.push('This file is not an HTML document.');

  const byKey = new Map(sections.map((section) => [section.key, section]));
  return {
    subject: subject.slice(0, 200),
    preheader: preheader.slice(0, 300),
    sections: (['shipped', 'ecosystem', 'learned'] as const).map((key) => byKey.get(key) ?? {
      key,
      heading: SECTION_HEADINGS[key],
      body: '',
      signalIds: [],
    }),
    warnings,
  };
}

export function parseNewsletterDocument(filename: string, source: string): NewsletterDocumentDraft {
  return /\.html?$/i.test(filename) ? parseHtmlNewsletter(filename, source) : parseMarkdownNewsletter(filename, source);
}
