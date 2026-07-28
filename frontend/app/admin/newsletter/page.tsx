'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  api,
  ApiError,
  type DraftFinding,
  type IssueSection,
  type NewsletterEngineState,
  type NewsletterIssue,
} from '@/core/api';
import { useDialog } from '@/shared/components/Dialog';

/// The approval gate.
///
/// Nothing on this screen sends anything. Approving marks an issue ready and
/// stops there, which is deliberate: the moment a button on a draft screen can
/// reach an inbox, every mis-click is a send.
///
/// The screen is built around reading the thing before agreeing to it, so the
/// rendered email is the default view and the edit box is one click away.

const STATUS_STYLE: Record<NewsletterIssue['status'], string> = {
  draft: 'border-white/20 text-white/60',
  approved: 'border-[#AFC95B]/50 text-[#AFC95B]',
  rejected: 'border-[#e0794f]/40 text-[#e0794f]',
  sent: 'border-white/30 text-white/80',
};

function when(ts: number): string {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function Findings({ findings }: { findings: DraftFinding[] }) {
  if (findings.length === 0) {
    return (
      <p className="text-[12px] text-[#AFC95B]">
        Voice and claim checks pass. Every claim traces to a collected signal.
      </p>
    );
  }
  return (
    <ul className="space-y-1.5">
      {findings.map((f, i) => (
        <li key={i} className="text-[12px]">
          <span
            className={`mono text-[10px] uppercase tracking-[0.1em] ${
              f.severity === 'error' ? 'text-[#e0794f]' : 'text-white/40'
            }`}
          >
            line {f.line} · {f.rule}
          </span>
          <span className="block text-white/60">{f.excerpt}</span>
          <span className="block text-white/35">{f.fix}</span>
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
  const [draftSections, setDraftSections] = useState<IssueSection[]>([]);

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
    setPreview(null);
    setSocialDraft(null);
    try {
      const r = await api.adminNewsletterPreview(id);
      setPreview(r);
      setDraftSubject(r.issue.subject);
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

  async function save(id: string) {
    try {
      await api.adminEditNewsletter(id, { subject: draftSubject, sections: draftSections });
      setEditing(false);
      openIssue(id);
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not save the edit');
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
      <p className="mono text-[10px] uppercase tracking-[0.18em] text-white/40">[:NEWSLETTER:]</p>
      <h1 className="mt-2 font-sans text-[24px] font-extrabold">Issues</h1>
      <p className="mt-2 text-[13px] text-white/55 max-w-[68ch]">
        Drafted from the signal pipeline when there is real news. Approving marks an issue ready.
        Sending is a separate step and does not happen here.
      </p>

      {err && (
        <p className="mt-4 text-[12px] text-[#e0794f] border border-[#e0794f]/30 bg-[#e0794f]/10 rounded-lg px-3 py-2">
          {err}
        </p>
      )}
      {notice && (
        <p className="mt-4 text-[12px] text-white/70 border border-white/15 bg-white/5 rounded-lg px-3 py-2">
          {notice}
        </p>
      )}

      {engine && (
        <div className="mt-6 border border-white/10 rounded-xl p-5 bg-[#161616]">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`mono text-[9px] uppercase tracking-[0.14em] px-2 py-1 rounded border ${
                engine.enabled ? 'border-[#AFC95B]/50 text-[#AFC95B]' : 'border-[#e0794f]/40 text-[#e0794f]'
              }`}
            >
              {engine.enabled ? 'Engine on' : 'Engine off'}
            </span>
            <span className="mono text-[10px] uppercase tracking-[0.12em] text-white/35">
              {engine.waiting} signal{engine.waiting === 1 ? '' : 's'} waiting
            </span>
            {engine.clusters.map((c) => (
              <span key={c.key} className="mono text-[10px] text-white/30">
                {c.key} {c.count}
              </span>
            ))}
          </div>
          <p className="mt-3 text-[13px] text-white/70">{engine.reason}</p>
          {!engine.enabled && (
            <p className="mt-1.5 text-[12px] text-white/35">
              Set NEWSLETTER_ENABLED to turn it on. Nothing drafts or approves while it is off.
            </p>
          )}

          <div className="mt-4 flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => draft(false)}
              disabled={busy || !engine.enabled}
              className="mono text-[10px] uppercase tracking-[0.12em] font-bold px-4 py-2.5 rounded-lg bg-white text-[#0e0e0e] disabled:opacity-40"
            >
              {busy ? 'Drafting' : 'Draft an issue'}
            </button>
            <button
              type="button"
              onClick={() => draft(true)}
              disabled={busy || !engine.enabled}
              className="mono text-[10px] uppercase tracking-[0.12em] px-4 py-2.5 rounded-lg border border-white/15 text-white/55 hover:text-white disabled:opacity-40"
              title="Ignores the thresholds and the send caps. Not the kill switch."
            >
              Force a draft
            </button>
          </div>
        </div>
      )}

      <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        <div className="space-y-2">
          {issues === null && <p className="text-[13px] text-white/40">Loading</p>}
          {issues?.length === 0 && (
            <p className="text-[13px] text-white/40">No issues yet.</p>
          )}
          {issues?.map((issue) => (
            <button
              key={issue.id}
              type="button"
              onClick={() => openIssue(issue.id)}
              className={`w-full text-left border rounded-xl p-3 transition ${
                open === issue.id ? 'border-white/40 bg-[#1c1c1c]' : 'border-white/10 bg-[#161616] hover:border-white/25'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`mono text-[9px] uppercase tracking-[0.14em] px-2 py-0.5 rounded border ${
                    STATUS_STYLE[issue.status]
                  }`}
                >
                  {issue.status}
                </span>
                <span className="mono text-[10px] text-white/30">{when(issue.createdAt)}</span>
              </div>
              <p className="mt-2 text-[13px] font-bold break-words">{issue.subject}</p>
              {issue.monthInReview && (
                <p className="mt-1 mono text-[10px] text-white/30">month in review</p>
              )}
            </button>
          ))}
        </div>

        <div>
          {open && !preview && <p className="text-[13px] text-white/40">Rendering</p>}
          {preview && (
            <div className="border border-white/10 rounded-xl bg-[#161616] overflow-hidden">
              <div className="p-4 border-b border-white/10">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="mono text-[10px] uppercase tracking-[0.12em] text-white/35">
                      Subject
                    </p>
                    <p className="mt-1 text-[14px] font-bold break-words">{preview.issue.subject}</p>
                    <p className="mt-1 text-[12px] text-white/50">{preview.issue.preheader}</p>
                    {preview.issue.draftedBy && (
                      <p className="mt-1.5 mono text-[10px] text-white/25">
                        written by {preview.issue.draftedBy}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap shrink-0">
                    {preview.issue.status === 'draft' && (
                      <>
                        <button
                          type="button"
                          onClick={() => setEditing((v) => !v)}
                          className="mono text-[10px] uppercase tracking-[0.12em] px-3 py-2 rounded-lg border border-white/15 text-white/55 hover:text-white"
                        >
                          {editing ? 'Cancel' : 'Edit'}
                        </button>
                        <button
                          type="button"
                          onClick={() => approve(preview.issue.id)}
                          disabled={!preview.review.clean}
                          title={
                            preview.review.clean
                              ? 'Mark ready to send'
                              : 'Fix the errors below first'
                          }
                          className="mono text-[10px] uppercase tracking-[0.12em] font-bold px-3 py-2 rounded-lg bg-white text-[#0e0e0e] disabled:opacity-40"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => reject(preview.issue.id)}
                          className="mono text-[10px] uppercase tracking-[0.12em] px-3 py-2 rounded-lg border border-[#e0794f]/40 text-[#e0794f]"
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
                          className="mono text-[10px] uppercase tracking-[0.12em] px-3 py-2 rounded-lg border border-white/15 text-white/55 hover:text-white disabled:opacity-40"
                        >
                          Dry run
                        </button>
                        <button
                          type="button"
                          onClick={() => send(preview.issue.id, true)}
                          disabled={busy}
                          className="mono text-[10px] uppercase tracking-[0.12em] font-bold px-3 py-2 rounded-lg bg-[#AFC95B] text-[#0e0e0e] disabled:opacity-40"
                        >
                          Send for real
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {preview.issue.status === 'sent' && (
                  <div className="mt-3">
                    <p className="mono text-[10px] uppercase tracking-[0.12em] text-white/35">
                      Sent · archived
                    </p>
                    <div className="mt-2 flex gap-2 flex-wrap">
                      {(['x', 'linkedin', 'youtube'] as const).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => social(preview.issue.id, p)}
                          disabled={busy}
                          className="mono text-[10px] uppercase tracking-[0.12em] px-3 py-2 rounded-lg border border-white/15 text-white/55 hover:text-white disabled:opacity-40"
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[11px] text-white/30">
                      Generates text to copy. Nothing is posted anywhere.
                    </p>
                  </div>
                )}

                {socialDraft && (
                  <div className="mt-4 border border-white/10 rounded-lg p-3 bg-[#0e0e0e]">
                    <p className="mono text-[10px] uppercase tracking-[0.12em] text-white/40">
                      {socialDraft.platform}
                    </p>
                    <div className="mt-2 space-y-2">
                      {socialDraft.posts.map((post, i) => (
                        <pre
                          key={i}
                          className="whitespace-pre-wrap text-[13px] text-white/80 border-l-2 border-white/15 pl-3 font-sans"
                        >
                          {post}
                        </pre>
                      ))}
                    </div>
                    {socialDraft.chapters && (
                      <>
                        <p className="mt-3 mono text-[10px] uppercase tracking-[0.12em] text-white/40">
                          Chapters
                        </p>
                        <ul className="mt-1 text-[12px] text-white/60 space-y-0.5">
                          {socialDraft.chapters.map((ch, i) => (
                            <li key={i}>{ch}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    {socialDraft.shotList && (
                      <>
                        <p className="mt-3 mono text-[10px] uppercase tracking-[0.12em] text-white/40">
                          Shot list
                        </p>
                        <ul className="mt-1 text-[12px] text-white/60 space-y-0.5">
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
                  <p className="mt-3 text-[12px] text-white/60 border-l-2 border-[#e0794f] pl-3">
                    Rejected: {preview.issue.rejectionNote}
                  </p>
                )}

                <div className="mt-4">
                  <Findings findings={preview.review.findings} />
                </div>
              </div>

              {editing ? (
                <div className="p-4 space-y-3">
                  <label className="block">
                    <span className="mono text-[10px] uppercase tracking-[0.12em] text-white/40">
                      Subject
                    </span>
                    <input
                      value={draftSubject}
                      onChange={(e) => setDraftSubject(e.target.value)}
                      className="mt-1.5 w-full bg-[#0e0e0e] border border-white/15 rounded-lg px-3 py-2.5 text-[14px] outline-none focus:border-white/40"
                    />
                  </label>
                  {draftSections.map((s, i) => (
                    <label key={s.key} className="block">
                      <span className="mono text-[10px] uppercase tracking-[0.12em] text-white/40">
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
                        className="mt-1.5 w-full bg-[#0e0e0e] border border-white/15 rounded-lg px-3 py-2.5 text-[13px] outline-none focus:border-white/40 resize-y"
                      />
                    </label>
                  ))}
                  <button
                    type="button"
                    onClick={() => save(preview.issue.id)}
                    className="mono text-[10px] uppercase tracking-[0.12em] font-bold px-4 py-2.5 rounded-lg bg-white text-[#0e0e0e]"
                  >
                    Save
                  </button>
                </div>
              ) : (
                /* The real email, in the frame it will arrive in. A preview that
                   is not the rendered article is a preview of something else. */
                <iframe
                  title="Issue preview"
                  srcDoc={preview.rendered.html}
                  sandbox=""
                  className="w-full h-[720px] bg-white"
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
