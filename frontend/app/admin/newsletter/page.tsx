'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  ApiError,
  type DraftFinding,
  type IssueSection,
  type NewsletterEngineState,
  type NewsletterIssue,
} from '@/core/api';
import { useDialog } from '@/shared/components/Dialog';
import { NewsletterDraftReview, type NewsletterDraftReviewValue } from '@/features/admin/NewsletterDraftReview';
import { parseNewsletterDocument } from '@/features/admin/newsletterMarkdown';

/// The approval gate.
///
/// Nothing on this screen sends anything. Approving marks an issue ready and
/// stops there, which is deliberate: the moment a button on a draft screen can
/// reach an inbox, every mis-click is a send.
///
/// The screen is built around reading the thing before agreeing to it, so the
/// rendered email is the default view and the edit box is one click away.

const STATUS_STYLE: Record<NewsletterIssue['status'], string> = {
  draft: 'border-[var(--d-line)] text-[var(--d-text-2)]',
  approved: 'border-[#3D4A22] text-[var(--d-lime)]',
  rejected: 'border-[#5A2A2E] text-[var(--d-red)]',
  sent: 'border-[var(--d-line-2)] text-[var(--d-text)]',
};

function when(ts: number): string {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function Findings({ findings }: { findings: DraftFinding[] }) {
  if (findings.length === 0) {
    return (
      <p className="text-[12px] text-[var(--d-lime)]">
        Voice and claim checks pass. Every claim traces to a collected signal.
      </p>
    );
  }
  return (
    <ul className="space-y-1.5">
      {findings.map((f, i) => (
        <li key={i} className="text-[12px]">
          <span
            className={` text-[10px] ${
 f.severity === 'error' ? 'text-[var(--d-red)]' : 'text-[var(--d-text-2)]'
 }`}
          >
            line {f.line} · {f.rule}
          </span>
          <span className="block text-[var(--d-text-2)]">{f.excerpt}</span>
          <span className="block text-[var(--d-text-3)]">{f.fix}</span>
        </li>
      ))}
    </ul>
  );
}

export default function AdminNewsletterPage() {
  const { confirm, prompt } = useDialog();
  const [issues, setIssues] = useState<NewsletterIssue[] | null>(null);
  const [engine, setEngine] = useState<NewsletterEngineState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [open, setOpen] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    issue: NewsletterIssue;
    rendered: { html: string; text: string };
    review: { findings: DraftFinding[]; clean: boolean };
  } | null>(null);
  const [socialDraft, setSocialDraft] = useState<{
    platform: string;
    posts: string[];
    chapters?: string[];
    shotList?: string[];
    findings: DraftFinding[];
  } | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftSubject, setDraftSubject] = useState('');
  const [draftPreheader, setDraftPreheader] = useState('');
  const [draftSections, setDraftSections] = useState<IssueSection[]>([]);
  const [reviewDraft, setReviewDraft] = useState<NewsletterDraftReviewValue | null>(null);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const importInput = useRef<HTMLInputElement | null>(null);

  const load = useCallback(() => {
    api
      .adminListNewsletter()
      .then((r) => {
        setIssues(r.issues);
        setEngine(r.engine);
        setErr(null);
      })
      .catch((e) => setErr(e instanceof ApiError ? e.message : 'Could not load the newsletter'));
  }, []);

  useEffect(load, [load]);

  const openIssue = useCallback(async (id: string) => {
    setOpen(id);
    setEditing(false);
    setReviewDraft(null);
    setPreview(null);
    setSocialDraft(null);
    try {
      const r = await api.adminNewsletterPreview(id);
      setPreview(r);
      setDraftSubject(r.issue.subject);
      setDraftPreheader(r.issue.preheader);
      setDraftSections(r.issue.sections);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not render this issue');
    }
  }, []);

  async function draft(force: boolean) {
    if (busy) return;
    setBusy(true);
    setErr(null);
    setNotice(null);
    try {
      const r = await api.adminDraftNewsletter(force);
      setNotice(r.drafted ? `Drafted. ${r.reason}` : r.reason);
      load();
      if (r.issue) openIssue(r.issue.id);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'The drafter failed');
    } finally {
      setBusy(false);
    }
  }

  function beginReview(
    source?: string,
    warnings?: string[],
    value: Pick<NewsletterDraftReviewValue, 'subject' | 'preheader' | 'sections' | 'sourceHtml'> = {
      subject: draftSubject,
      preheader: draftPreheader,
      sections: draftSections,
    },
  ) {
    setReviewDraft({
      ...value,
      source,
      warnings,
    });
  }

  async function saveReviewed(id: string) {
    if (!reviewDraft || reviewSaving) return;
    setReviewSaving(true);
    try {
      await api.adminEditNewsletter(id, {
        subject: reviewDraft.subject,
        preheader: reviewDraft.preheader,
        sourceHtml: reviewDraft.sourceHtml,
        sections: reviewDraft.sections,
      });
      setDraftSubject(reviewDraft.subject);
      setDraftPreheader(reviewDraft.preheader);
      setDraftSections(reviewDraft.sections);
      setReviewDraft(null);
      setEditing(false);
      openIssue(id);
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not save the reviewed edit');
    } finally {
      setReviewSaving(false);
    }
  }

  async function importMarkdown(file: File) {
    setImporting(true);
    setErr(null);
    try {
      const source = await file.text();
      const parsed = parseNewsletterDocument(file.name, source);
      setDraftSubject(parsed.subject || draftSubject);
      setDraftPreheader(parsed.preheader || draftPreheader);
      setDraftSections(parsed.sections);
      setEditing(false);
      beginReview(file.name, parsed.warnings, {
        ...parsed,
        sourceHtml: /\.html?$/i.test(file.name) ? source : undefined,
      });
    } catch {
      setErr('Could not read that HTML or Markdown file');
    } finally {
      setImporting(false);
      if (importInput.current) importInput.current.value = '';
    }
  }

  async function approve(id: string) {
    const ok = await confirm({
      title: 'Approve this issue',
      message: 'It is marked ready to send. Nothing goes out until you send it separately.',
      confirmLabel: 'Approve',
    });
    if (!ok) return;
    try {
      const r = await api.adminApproveNewsletter(id);
      setNotice(r.note);
      load();
      openIssue(id);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not approve');
    }
  }

  async function send(id: string, forReal: boolean) {
    if (forReal) {
      // Typed, not clicked. This is the only irreversible action in the panel
      // and a yes/no dialog is a thing people dismiss without reading.
      const typed = await prompt({
        title: 'Send to every subscriber',
        message: 'This cannot be undone. Type SEND to confirm.',
        placeholder: 'SEND',
        confirmLabel: 'Send it',
      });
      if (typed !== 'SEND') return;
    }
    setBusy(true);
    try {
      const r = await api.adminSendNewsletter(id, forReal);
      setNotice(
        r.sent
          ? `Sent. Archived at ${r.archiveUrl}${r.announced ? ' and announced on Telegram.' : '.'}`
          : `${r.note} ${r.warnings.join(' ')}`,
      );
      load();
      openIssue(id);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'The send failed');
    } finally {
      setBusy(false);
    }
  }

  async function social(id: string, platform: 'x' | 'linkedin' | 'youtube') {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.adminSocialDraft(id, platform);
      setSocialDraft(r.draft);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : `Could not write the ${platform} draft`);
    } finally {
      setBusy(false);
    }
  }

  async function reject(id: string) {
    const note = await prompt({
      title: 'Reject this draft',
      message: 'What was wrong with it? This goes into the next draft, so be specific.',
      placeholder: 'Too long, and stop calling it a platform.',
      confirmLabel: 'Reject',
    });
    if (!note?.trim()) return;
    try {
      const r = await api.adminRejectNewsletter(id, note.trim());
      setNotice(r.note);
      load();
      openIssue(id);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not reject');
    }
  }

  return (
    <div>
      <p className="text-[10px] text-[var(--d-text-2)]">Newsletter</p>
      <h1 className="mt-2 font-sans text-[24px] font-semibold">Issues</h1>
      <p className="mt-2 text-[13px] text-[var(--d-text-2)] max-w-[68ch]">
        Drafted from the signal pipeline when there is real news. Approving marks an issue ready.
        Sending is a separate step and does not happen here.
      </p>

      {err && (
        <p className="mt-4 text-[12px] text-[var(--d-red)] border border-[#5A2A2E] bg-[#3A1C1F] rounded-lg px-3 py-2">
          {err}
        </p>
      )}
      {notice && (
        <p className="mt-4 text-[12px] text-[var(--d-text)] border border-[var(--d-line)] bg-[var(--d-surface)] rounded-lg px-3 py-2">
          {notice}
        </p>
      )}

      {engine && (
        <div className="mt-6 border border-[var(--d-line)] rounded-lg p-5 bg-[var(--d-surface)]">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={` text-[9px] px-2 py-1 rounded border ${
 engine.enabled ? 'border-[#3D4A22] text-[var(--d-lime)]' : 'border-[#5A2A2E] text-[var(--d-red)]'
 }`}
            >
              {engine.enabled ? 'Engine on' : 'Engine off'}
            </span>
            <span className="text-[10px] text-[var(--d-text-3)]">
              {engine.waiting} signal{engine.waiting === 1 ? '' : 's'} waiting
            </span>
            {engine.clusters.map((c) => (
              <span key={c.key} className="text-[10px] text-[var(--d-text-3)]">
                {c.key} {c.count}
              </span>
            ))}
          </div>
          <p className="mt-3 text-[13px] text-[var(--d-text)]">{engine.reason}</p>
          {!engine.enabled && (
            <p className="mt-1.5 text-[12px] text-[var(--d-text-3)]">
              Set NEWSLETTER_ENABLED to turn it on. Nothing drafts or approves while it is off.
            </p>
          )}

          <div className="mt-4 flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => draft(false)}
              disabled={busy || !engine.enabled}
              className="text-[10px] font-bold px-4 py-2.5 rounded-lg bg-[var(--d-text)] text-[#0D0E10] disabled:opacity-40"
            >
              {busy ? 'Drafting' : 'Draft an issue'}
            </button>
            <button
              type="button"
              onClick={() => draft(true)}
              disabled={busy || !engine.enabled}
              className="text-[10px] px-4 py-2.5 rounded-lg border border-[var(--d-line)] text-[var(--d-text-2)] hover:text-[var(--d-text)] disabled:opacity-40"
              title="Ignores the thresholds and the send caps. Not the kill switch."
            >
              Force a draft
            </button>
          </div>
        </div>
      )}

      <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        <div className="space-y-2">
          {issues === null && <p className="text-[13px] text-[var(--d-text-2)]">Loading</p>}
          {issues?.length === 0 && (
            <p className="text-[13px] text-[var(--d-text-2)]">No issues yet.</p>
          )}
          {issues?.map((issue) => (
            <button
              key={issue.id}
              type="button"
              onClick={() => openIssue(issue.id)}
              className={`w-full text-left border rounded-lg p-3 transition ${
 open === issue.id ? 'border-[var(--d-line-2)] bg-[#1c1c1c]' : 'border-[var(--d-line)] bg-[var(--d-surface)] hover:border-[var(--d-line-2)]'
 }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={` text-[9px] px-2 py-0.5 rounded border ${
 STATUS_STYLE[issue.status]
 }`}
                >
                  {issue.status}
                </span>
                <span className="text-[10px] text-[var(--d-text-3)]">{when(issue.createdAt)}</span>
              </div>
              <p className="mt-2 text-[13px] font-bold break-words">{issue.subject}</p>
              {issue.monthInReview && (
                <p className="mt-1 text-[10px] text-[var(--d-text-3)]">month in review</p>
              )}
            </button>
          ))}
        </div>

        <div>
          {open && !preview && <p className="text-[13px] text-[var(--d-text-2)]">Rendering</p>}
          {preview && (
            <div className="border border-[var(--d-line)] rounded-lg bg-[var(--d-surface)] overflow-hidden">
              <div className="p-4 border-b border-[var(--d-line)]">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-[10px] text-[var(--d-text-3)]">
                      Subject
                    </p>
                    <p className="mt-1 text-[14px] font-bold break-words">{preview.issue.subject}</p>
                    <p className="mt-1 text-[12px] text-[var(--d-text-2)]">{preview.issue.preheader}</p>
                    {preview.issue.draftedBy && (
                      <p className="mt-1.5 text-[10px] text-[var(--d-text-3)]">
                        written by {preview.issue.draftedBy}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap shrink-0">
                    {preview.issue.status === 'draft' && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setReviewDraft(null);
                            setEditing((v) => !v);
                          }}
                          className="min-h-11 text-[10px] px-3 rounded-lg border border-[var(--d-line)] text-[var(--d-text-2)] hover:text-[var(--d-text)]"
                        >
                          {editing ? 'Cancel' : 'Edit'}
                        </button>
                        <button
                          type="button"
                          onClick={() => importInput.current?.click()}
                          disabled={importing}
                          className="min-h-11 text-[10px] px-3 rounded-lg border border-[#3D4A22] text-[var(--d-lime)] hover:bg-[#1F2614] disabled:opacity-40"
                        >
                          {importing ? 'Reading' : 'Import HTML or Markdown'}
                        </button>
                        <input
                          ref={importInput}
                          type="file"
                          accept=".html,.htm,.md,.markdown,text/html,text/markdown"
                          className="sr-only"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void importMarkdown(file);
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => approve(preview.issue.id)}
                          disabled={!preview.review.clean || editing || Boolean(reviewDraft)}
                          title={
                            preview.review.clean
                              ? 'Mark ready to send'
                              : 'Fix the errors below first'
                          }
                          className="text-[10px] font-bold px-3 py-2 rounded-lg bg-[var(--d-text)] text-[#0D0E10] disabled:opacity-40"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => reject(preview.issue.id)}
                          className="text-[10px] px-3 py-2 rounded-lg border border-[#5A2A2E] text-[var(--d-red)]"
                        >
                          Reject
                        </button>
                      </>
                    )}

                    {preview.issue.status === 'approved' && (
                      <>
                        <button
                          type="button"
                          onClick={() => send(preview.issue.id, false)}
                          disabled={busy}
                          className="text-[10px] px-3 py-2 rounded-lg border border-[var(--d-line)] text-[var(--d-text-2)] hover:text-[var(--d-text)] disabled:opacity-40"
                        >
                          Dry run
                        </button>
                        <button
                          type="button"
                          onClick={() => send(preview.issue.id, true)}
                          disabled={busy}
                          className="text-[10px] font-bold px-3 py-2 rounded-lg bg-[var(--d-lime)] text-[#0D0E10] disabled:opacity-40"
                        >
                          Send for real
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {preview.issue.status === 'sent' && (
                  <div className="mt-3">
                    <p className="text-[10px] text-[var(--d-text-3)]">
                      Sent · archived
                    </p>
                    <div className="mt-2 flex gap-2 flex-wrap">
                      {(['x', 'linkedin', 'youtube'] as const).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => social(preview.issue.id, p)}
                          disabled={busy}
                          className="text-[10px] px-3 py-2 rounded-lg border border-[var(--d-line)] text-[var(--d-text-2)] hover:text-[var(--d-text)] disabled:opacity-40"
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[11px] text-[var(--d-text-3)]">
                      Generates text to copy. Nothing is posted anywhere.
                    </p>
                  </div>
                )}

                {socialDraft && (
                  <div className="mt-4 border border-[var(--d-line)] rounded-lg p-3 bg-[var(--d-bg)]">
                    <p className="text-[10px] text-[var(--d-text-2)]">
                      {socialDraft.platform}
                    </p>
                    <div className="mt-2 space-y-2">
                      {socialDraft.posts.map((post, i) => (
                        <pre
                          key={i}
                          className="whitespace-pre-wrap text-[13px] text-[var(--d-text)] border-l-2 border-[var(--d-line)] pl-3 font-sans"
                        >
                          {post}
                        </pre>
                      ))}
                    </div>
                    {socialDraft.chapters && (
                      <>
                        <p className="mt-3 text-[10px] text-[var(--d-text-2)]">
                          Chapters
                        </p>
                        <ul className="mt-1 text-[12px] text-[var(--d-text-2)] space-y-0.5">
                          {socialDraft.chapters.map((ch, i) => (
                            <li key={i}>{ch}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    {socialDraft.shotList && (
                      <>
                        <p className="mt-3 text-[10px] text-[var(--d-text-2)]">
                          Shot list
                        </p>
                        <ul className="mt-1 text-[12px] text-[var(--d-text-2)] space-y-0.5">
                          {socialDraft.shotList.map((shot, i) => (
                            <li key={i}>{shot}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    {socialDraft.findings.length > 0 && (
                      <div className="mt-3">
                        <Findings findings={socialDraft.findings} />
                      </div>
                    )}
                  </div>
                )}

                {preview.issue.rejectionNote && (
                  <p className="mt-3 text-[12px] text-[var(--d-text-2)] border-l-2 border-[#5A2A2E] pl-3">
                    Rejected: {preview.issue.rejectionNote}
                  </p>
                )}

                <div className="mt-4">
                  <Findings findings={preview.review.findings} />
                </div>
              </div>

              {reviewDraft ? (
                <div className="p-4">
                  <NewsletterDraftReview
                    draft={reviewDraft}
                    saving={reviewSaving}
                    onBack={() => {
                      setReviewDraft(null);
                      setEditing(true);
                    }}
                    onSave={() => saveReviewed(preview.issue.id)}
                  />
                </div>
              ) : editing ? (
                <div className="p-4 space-y-3">
                  <label className="block">
                    <span className="text-[10px] text-[var(--d-text-2)]">
                      Subject
                    </span>
                    <input
                      value={draftSubject}
                      onChange={(e) => setDraftSubject(e.target.value)}
                      className="mt-1.5 w-full bg-[var(--d-bg)] border border-[var(--d-line)] rounded-lg px-3 py-2.5 text-[14px] outline-none focus:border-[var(--d-line-2)]"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] text-[var(--d-text-2)]">
                      Preview text
                    </span>
                    <input
                      value={draftPreheader}
                      onChange={(e) => setDraftPreheader(e.target.value)}
                      className="mt-1.5 w-full bg-[var(--d-bg)] border border-[var(--d-line)] rounded-lg px-3 py-2.5 text-[14px] outline-none focus:border-[var(--d-line-2)]"
                    />
                  </label>
                  {draftSections.map((s, i) => (
                    <label key={s.key} className="block">
                      <span className="text-[10px] text-[var(--d-text-2)]">
                        {s.heading}
                      </span>
                      <textarea
                        value={s.body}
                        rows={8}
                        onChange={(e) =>
                          setDraftSections((prev) =>
                            prev.map((p, j) => (i === j ? { ...p, body: e.target.value } : p)),
                          )
                        }
                        className="mt-1.5 w-full bg-[var(--d-bg)] border border-[var(--d-line)] rounded-lg px-3 py-2.5 text-[13px] outline-none focus:border-[var(--d-line-2)] resize-y"
                      />
                    </label>
                  ))}
                  <button
                    type="button"
                    onClick={() => beginReview()}
                    className="min-h-11 text-[10px] font-bold px-4 rounded-lg bg-[var(--d-text)] text-[#0D0E10]"
                  >
                    Review changes
                  </button>
                </div>
              ) : (
                /* The real email, in the frame it will arrive in. A preview that
                   is not the rendered article is a preview of something else. */
                <iframe
                  title="Issue preview"
                  srcDoc={preview.rendered.html}
                  sandbox=""
                  className="w-full h-[720px] bg-[var(--d-text)]"
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
