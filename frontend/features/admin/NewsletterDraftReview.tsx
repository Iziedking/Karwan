'use client';

import { useState, type ReactNode } from 'react';
import type { IssueSection } from '@/core/api';

export interface NewsletterDraftReviewValue {
  subject: string;
  preheader: string;
  sections: IssueSection[];
  source?: string;
  sourceHtml?: string;
  warnings?: string[];
}

function InlineText({ value }: { value: string }) {
  const plain = value.replace(/\*\*([^*]+)\*\*/g, '$1');
  const parts: ReactNode[] = [];
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(plain))) {
    if (match.index > cursor) parts.push(plain.slice(cursor, match.index));
    parts.push(
    <a key={`${match[1]}-${match.index}`} href={match[2]} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-[var(--lp-accent)]">
        {match[1]}
      </a>,
    );
    cursor = match.index + match[0].length;
  }
  if (cursor < plain.length) parts.push(plain.slice(cursor));
  return <>{parts}</>;
}

function Body({ body }: { body: string }) {
  const blocks = body.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
  return (
    <div className="mt-3 space-y-3 text-[13px] leading-6 text-[#4f4f4a]">
      {blocks.map((block, index) => {
        const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
        if (lines.length > 0 && lines.every((line) => /^[-*]\s+/.test(line))) {
          return (
            <ul key={index} className="list-disc space-y-1 pl-5">
              {lines.map((line) => <li key={line}><InlineText value={line.replace(/^[-*]\s+/, '')} /></li>)}
            </ul>
          );
        }
        return <p key={index}><InlineText value={lines.join(' ')} /></p>;
      })}
    </div>
  );
}

export function NewsletterDraftReview({
  draft,
  onBack,
  onSave,
  saving,
}: {
  draft: NewsletterDraftReviewValue;
  onBack: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const [view, setView] = useState<'branded' | 'structured'>(draft.sourceHtml ? 'branded' : 'structured');

  return (
    <section className="border border-[#AFC95B]/45 rounded-xl bg-[#111111] overflow-hidden" aria-labelledby="newsletter-review-title">
      <div className="p-5 border-b border-white/10">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="mono text-[10px] uppercase tracking-[0.14em] text-[#AFC95B]">[:REVIEW BEFORE SAVE:]</p>
            <h2 id="newsletter-review-title" className="mt-2 text-[20px] font-bold">Review this draft</h2>
            <p className="mt-1 text-[12px] text-white/50">Nothing has changed on the issue yet. Check the clean reading view, then save.</p>
            {draft.source && <p className="mt-2 mono text-[10px] uppercase tracking-[0.12em] text-white/35">imported from {draft.source}</p>}
          </div>
          <div className="flex gap-2 shrink-0 flex-wrap">
            {draft.sourceHtml && (
              <button type="button" onClick={() => setView((current) => current === 'branded' ? 'structured' : 'branded')} disabled={saving} className="min-h-11 mono text-[10px] uppercase tracking-[0.12em] px-3 rounded-lg border border-[#AFC95B]/45 text-[#AFC95B] hover:bg-[#AFC95B]/10 disabled:opacity-40">
                {view === 'branded' ? 'View structured copy' : 'View branded page'}
              </button>
            )}
            <button type="button" onClick={onBack} disabled={saving} className="min-h-11 mono text-[10px] uppercase tracking-[0.12em] px-3 rounded-lg border border-white/15 text-white/60 hover:text-white disabled:opacity-40">Back to edit</button>
            <button type="button" onClick={onSave} disabled={saving || !draft.subject.trim() || !draft.sections.some((section) => section.body.trim())} className="min-h-11 mono text-[10px] uppercase tracking-[0.12em] font-bold px-4 rounded-lg bg-[#AFC95B] text-[#0e0e0e] disabled:opacity-40">{saving ? 'Saving' : 'Save changes'}</button>
          </div>
        </div>
        {draft.warnings && draft.warnings.length > 0 && (
          <ul className="mt-4 space-y-1 border-l-2 border-[#FFC857] pl-3 text-[12px] text-[#FFC857]" aria-label="Import notes">
            {draft.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        )}
      </div>
      {view === 'branded' && draft.sourceHtml ? (
        <div className="bg-[#f4f4f1] p-3 sm:p-5">
          <p className="mono px-2 pb-3 text-[10px] uppercase tracking-[0.14em] text-[#6e6e6a]">[:BRANDED HTML PREVIEW:]</p>
          <iframe title="Branded newsletter preview" srcDoc={draft.sourceHtml} sandbox="" className="h-[820px] w-full border border-black/10 bg-[#f4f4f1]" />
        </div>
      ) : (
      <div className="bg-[#f4f4f1] text-[#0e0e0e] p-6 sm:p-8">
        <p className="mono text-[10px] uppercase tracking-[0.14em] text-[#6e6e6a]">subject</p>
        <h3 className="mt-2 text-[24px] leading-tight font-bold">{draft.subject || 'Untitled issue'}</h3>
        {draft.preheader && <p className="mt-3 max-w-[68ch] text-[14px] leading-6 text-[#6e6e6a]">{draft.preheader}</p>}
        <div className="mt-8 space-y-8">
          {draft.sections.map((section, index) => (
            <article key={section.key} className="border-t border-black/10 pt-5">
              <p className="mono text-[10px] uppercase tracking-[0.14em] text-[#6e6e6a]">[:{String(index + 1).padStart(2, '0')} · {section.key}:]</p>
              <h4 className="mt-2 text-[18px] font-bold">{section.heading}</h4>
              {section.body ? <Body body={section.body} /> : <p className="mt-3 text-[13px] text-[#a33d2d]">This section is empty.</p>}
            </article>
          ))}
        </div>
      </div>
      )}
    </section>
  );
}
