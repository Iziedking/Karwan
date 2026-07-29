import { brandedEmailHtml, escapeHtml } from '../emails/brand.js';
import type { NewsletterIssue } from '../db/newsletter.js';

/// An issue as an email.
///
/// Rendered on the existing brand shell rather than a newsletter template of its
/// own, so an issue looks like the deal mail and the sign-in code a reader has
/// already seen from us. A newsletter that looks like a different company is a
/// newsletter that reads as a forward.
///
/// The body is written as light markdown by the drafter. Rendering it here
/// rather than asking the model for HTML keeps escaping in one place: a model
/// producing raw HTML is a model that can produce a broken table or an unclosed
/// tag straight into somebody's inbox.

/// Inline markdown, in the order that matters. Links are converted after
/// escaping, so the escape cannot eat the markup and the markup cannot smuggle
/// a tag through.
function inline(text: string): string {
  let out = escapeHtml(text);

  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_m, label: string, href: string) =>
      `<a href="${href}" style="color:#0E0E0E;text-decoration:underline;">${label}</a>`,
  );
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return out;
}

function paragraphs(body: string): string {
  return body
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      if (block.startsWith('- ')) {
        const items = block
          .split('\n')
          .filter((l) => l.trim().startsWith('- '))
          .map((l) => `<li style="margin:0 0 8px 0;">${inline(l.replace(/^\s*-\s*/, ''))}</li>`)
          .join('');
        return `<ul style="margin:0 0 16px 0;padding-left:20px;font-size:15px;line-height:1.65;color:#0E0E0E;">${items}</ul>`;
      }
      return `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.65;color:#0E0E0E;">${inline(
        block.replace(/\n/g, ' '),
      )}</p>`;
    })
    .join('');
}

export interface RenderedIssue {
  subject: string;
  html: string;
  text: string;
}

export function renderIssue(issue: NewsletterIssue): RenderedIssue {
  const sections = issue.sections
    .map(
      (s) => `
        <h2 style="margin:28px 0 12px 0;font-size:17px;font-weight:800;color:#0E0E0E;">${escapeHtml(
          s.heading,
        )}</h2>
        ${paragraphs(s.body)}`,
    )
    .join('');

  const sources = issue.sources.length
    ? `
        <hr style="border:0;border-top:1px solid rgba(0,0,0,0.08);margin:28px 0 16px 0;" />
        <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#6B6B6B;">Sources</p>
        <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.6;color:#6B6B6B;">
          ${issue.sources
            .map(
              (s) =>
                `<li style="margin:0 0 6px 0;">${
                  s.url
                    ? `<a href="${escapeHtml(s.url)}" style="color:#6B6B6B;">${escapeHtml(s.title)}</a>`
                    : escapeHtml(s.title)
                } · ${escapeHtml(s.source)} · ${new Date(s.publishedAt)
                  .toISOString()
                  .slice(0, 10)}</li>`,
            )
            .join('')}
        </ul>`
    : '';

  // One table row holding the whole issue.
  //
  // `brandedEmailHtml` injects this straight into the card's own <table>, so it
  // has to be <tr> rows. Loose <p> and <h2> tags are invalid there and every
  // client hoists them out, which renders the issue OUTSIDE the white card,
  // full bleed and running off the edge of a phone. The 28px horizontal padding
  // matches the shell's other rows so the text lines up under the wordmark.
  const inner = `
          <tr>
            <td style="padding:6px 28px 28px 28px;">
              <p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;color:#6B6B6B;">${escapeHtml(
                issue.preheader,
              )}</p>
              ${sections}
              ${sources}
            </td>
          </tr>`;

  return {
    subject: issue.subject,
    html: brandedEmailHtml({
      eyebrow: issue.monthInReview ? 'MONTH IN REVIEW' : 'KARWAN DISPATCH',
      title: issue.subject,
      inner,
      footerNote: 'You are getting this because you subscribed at karwan.site.',
    }),
    text: renderText(issue),
  };
}

/// The plain text part.
///
/// Not an afterthought: some clients show it, some readers prefer it, and a
/// missing text part is a spam signal. Links are moved out of the prose to the
/// end of their line so a reader still gets the url.
export function renderText(issue: NewsletterIssue): string {
  const lines = [issue.subject, '', issue.preheader, ''];

  for (const section of issue.sections) {
    lines.push(section.heading.toUpperCase(), '');
    lines.push(
      section.body
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1 ($2)')
        .replace(/\*\*([^*]+)\*\*/g, '$1'),
    );
    lines.push('');
  }

  if (issue.sources.length) {
    lines.push('SOURCES', '');
    for (const s of issue.sources) {
      lines.push(`- ${s.title} · ${s.source}${s.url ? `\n  ${s.url}` : ''}`);
    }
    lines.push('');
  }

  lines.push('You are getting this because you subscribed at karwan.site.');
  return lines.join('\n');
}
