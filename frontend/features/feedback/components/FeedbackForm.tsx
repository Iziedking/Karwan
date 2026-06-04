'use client';
import { useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import {
  FullBleed,
  Band,
  GridOverlay,
  SectionTag,
  HeroHeadline,
  Punc,
  PageCard,
} from '@/shared/components/Bands';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

type Category = 'bug' | 'improvement' | 'other' | 'praise';

const CATEGORY_KEYS: Category[] = ['bug', 'improvement', 'other', 'praise'];

const MAX_SHOTS = 4;
// Downscale on the client so the upload stays small and the operator's view
// loads fast. 1800px on the long edge keeps UI text readable.
const MAX_DIM = 1800;
const JPEG_QUALITY = 0.9;

interface Shot {
  dataUrl: string;
  // A short label for the thumbnail (original filename or "pasted").
  name: string;
}

/// Loads an image file, downscales it to MAX_DIM on the long edge, and returns
/// a JPEG data URL. Screenshots rarely use transparency, so JPEG is a big size
/// win over PNG with no meaningful quality loss for bug reports.
function fileToShot(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        const scale = MAX_DIM / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('canvas unsupported'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('could not read image'));
    };
    img.src = url;
  });
}

export function FeedbackForm() {
  const fb = useTranslations().feedback;
  const { address } = useAuth();
  const [category, setCategory] = useState<Category>('bug');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [where, setWhere] = useState('');
  const [contact, setContact] = useState('');
  const [shots, setShots] = useState<Shot[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function addFiles(files: FileList | File[]) {
    setError(null);
    const incoming = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (incoming.length === 0) return;
    const room = MAX_SHOTS - shots.length;
    if (room <= 0) {
      setError(fb.errors.maxShotsTemplate.replace('{n}', String(MAX_SHOTS)));
      return;
    }
    const next: Shot[] = [];
    for (const file of incoming.slice(0, room)) {
      try {
        const dataUrl = await fileToShot(file);
        next.push({ dataUrl, name: file.name || 'pasted image' });
      } catch {
        setError(fb.errors.imageReadFailed);
      }
    }
    if (next.length > 0) setShots((s) => [...s, ...next]);
  }

  function onPaste(e: ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const images: File[] = [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) images.push(f);
      }
    }
    if (images.length > 0) {
      e.preventDefault();
      void addFiles(images);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer?.files?.length) void addFiles(e.dataTransfer.files);
  }

  function removeShot(i: number) {
    setShots((s) => s.filter((_, idx) => idx !== i));
  }

  async function submit() {
    setError(null);
    if (title.trim().length < 3) {
      setError(fb.errors.shortTitle);
      return;
    }
    if (message.trim().length < 5) {
      setError(fb.errors.shortMessage);
      return;
    }
    setBusy(true);
    try {
      const context = {
        ...(where.trim() ? { url: where.trim() } : {}),
        ...(address ? { wallet: address } : {}),
        ...(typeof navigator !== 'undefined' ? { userAgent: navigator.userAgent } : {}),
      };
      const res = await api.submitFeedback({
        category,
        title: title.trim(),
        message: message.trim(),
        ...(contact.trim() ? { contact: contact.trim() } : {}),
        ...(Object.keys(context).length > 0 ? { context } : {}),
        ...(shots.length > 0 ? { screenshots: shots.map((s) => ({ dataUrl: s.dataUrl })) } : {}),
      });
      setDoneId(res.id);
    } catch (err) {
      const detail =
        err instanceof ApiError && err.detail ? JSON.stringify(err.detail) : (err as Error).message;
      setError(detail || fb.errors.submitFailed);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setCategory('bug');
    setTitle('');
    setMessage('');
    setWhere('');
    setContact('');
    setShots([]);
    setError(null);
    setDoneId(null);
  }

  return (
    <FullBleed>
      <Band tone="dark" overlay={<GridOverlay />}>
        <div className="fade-up fade-up-1">
          <SectionTag tone="dark">{fb.hero.tag}</SectionTag>
        </div>
        <div className="fade-up fade-up-2">
          <HeroHeadline>
            {fb.hero.headline}
            <Punc>.</Punc>
          </HeroHeadline>
        </div>
        <p className="fade-up fade-up-3 mt-4 max-w-[60ch] text-[15px] leading-relaxed text-white/65">
          {fb.hero.body}
        </p>
      </Band>

      <Band tone="light" compact>
        {doneId ? (
          <SuccessCard onReset={reset} copy={fb.success} />
        ) : (
          <div className="max-w-[760px]">
            <PageCard>
              <div className="p-6 md:p-8 space-y-7">
                {/* CATEGORY */}
                <Field label={fb.fields.categoryEyebrow}>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {CATEGORY_KEYS.map((key) => {
                      const c = fb.categories[key];
                      const on = category === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setCategory(key)}
                          className="text-start px-3 py-2.5 transition-colors"
                          style={{
                            background: on ? 'var(--lp-band-dark)' : 'var(--lp-light)',
                            border: `1px solid ${on ? 'var(--lp-band-dark)' : 'var(--lp-border-light)'}`,
                            borderTopLeftRadius: 10,
                            borderTopRightRadius: 10,
                            borderBottomLeftRadius: 10,
                            borderBottomRightRadius: 3,
                          }}
                        >
                          <span
                            className="block mono text-[11px] font-bold uppercase tracking-[0.08em]"
                            style={{ color: on ? 'var(--lp-accent)' : 'var(--lp-dark)' }}
                          >
                            {c.label}
                          </span>
                          <span
                            className="block mt-0.5 text-[11px] leading-snug"
                            style={{ color: on ? 'rgba(255,255,255,0.6)' : 'var(--lp-text-muted)' }}
                          >
                            {c.blurb}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </Field>

                {/* TITLE */}
                <Field label={fb.fields.titleEyebrow}>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={140}
                    placeholder={fb.placeholders.title}
                    className="w-full px-3.5 py-3 text-[14px] text-[var(--lp-dark)] bg-[var(--lp-light)] outline-none focus:border-[var(--lp-accent)] transition-colors"
                    style={{
                      border: '1px solid var(--lp-border-light)',
                      borderTopLeftRadius: 10,
                      borderTopRightRadius: 10,
                      borderBottomLeftRadius: 10,
                      borderBottomRightRadius: 3,
                    }}
                  />
                </Field>

                {/* MESSAGE */}
                <Field label={fb.fields.messageEyebrow}>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onPaste={onPaste}
                    maxLength={4000}
                    rows={6}
                    placeholder={fb.placeholders.message}
                    className="w-full px-3.5 py-3 text-[14px] leading-relaxed text-[var(--lp-dark)] bg-[var(--lp-light)] outline-none focus:border-[var(--lp-accent)] transition-colors resize-y"
                    style={{
                      border: '1px solid var(--lp-border-light)',
                      borderTopLeftRadius: 10,
                      borderTopRightRadius: 10,
                      borderBottomLeftRadius: 10,
                      borderBottomRightRadius: 3,
                    }}
                  />
                </Field>

                {/* SCREENSHOTS */}
                <Field
                  label={fb.fields.screenshotsEyebrowTemplate
                    .replace('{n}', String(shots.length))
                    .replace('{max}', String(MAX_SHOTS))}
                >
                  <div
                    onPaste={onPaste}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={onDrop}
                    className="px-4 py-6 text-center transition-colors"
                    style={{
                      border: `1.5px dashed ${dragging ? 'var(--lp-accent)' : 'var(--lp-border-light)'}`,
                      background: dragging ? 'rgba(175, 201, 91,0.06)' : 'var(--lp-light)',
                      borderRadius: 12,
                    }}
                  >
                    <p className="text-[13px] text-[var(--lp-text-sub)]">
                      {fb.dropZone.bodyBefore}
                      <button
                        type="button"
                        onClick={() => fileInput.current?.click()}
                        className="font-semibold text-[var(--lp-dark)] underline underline-offset-2 hover:text-[var(--lp-accent-hover)]"
                      >
                        {fb.dropZone.chooseFiles}
                      </button>
                      {fb.dropZone.bodyAfter}
                    </p>
                    <p className="mt-1 mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                      {fb.dropZone.formatLine.replace('{n}', String(MAX_SHOTS))}
                    </p>
                    <input
                      ref={fileInput}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files) void addFiles(e.target.files);
                        e.target.value = '';
                      }}
                    />
                  </div>

                  {shots.length > 0 && (
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {shots.map((s, i) => (
                        <div
                          key={i}
                          className="group relative overflow-hidden border border-[var(--lp-border-light)]"
                          style={{ borderRadius: 10 }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={s.dataUrl} alt={s.name} className="block w-full h-24 object-cover" />
                          <button
                            type="button"
                            onClick={() => removeShot(i)}
                            aria-label={fb.dropZone.removeAria}
                            className="absolute top-1 end-1 inline-flex items-center justify-center w-6 h-6 text-white bg-black/55 hover:bg-black/80 transition-colors"
                            style={{ borderRadius: 6 }}
                          >
                            <span aria-hidden className="text-[14px] leading-none">×</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </Field>

                {/* OPTIONAL CONTEXT */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label={fb.fields.whereEyebrow}>
                    <input
                      value={where}
                      onChange={(e) => setWhere(e.target.value)}
                      maxLength={500}
                      placeholder={fb.placeholders.where}
                      className="w-full px-3.5 py-3 text-[14px] text-[var(--lp-dark)] bg-[var(--lp-light)] outline-none focus:border-[var(--lp-accent)] transition-colors"
                      style={{
                        border: '1px solid var(--lp-border-light)',
                        borderTopLeftRadius: 10,
                        borderTopRightRadius: 10,
                        borderBottomLeftRadius: 10,
                        borderBottomRightRadius: 3,
                      }}
                    />
                  </Field>
                  <Field label={fb.fields.contactEyebrow}>
                    <input
                      value={contact}
                      onChange={(e) => setContact(e.target.value)}
                      maxLength={200}
                      placeholder={fb.placeholders.contact}
                      className="w-full px-3.5 py-3 text-[14px] text-[var(--lp-dark)] bg-[var(--lp-light)] outline-none focus:border-[var(--lp-accent)] transition-colors"
                      style={{
                        border: '1px solid var(--lp-border-light)',
                        borderTopLeftRadius: 10,
                        borderTopRightRadius: 10,
                        borderBottomLeftRadius: 10,
                        borderBottomRightRadius: 3,
                      }}
                    />
                  </Field>
                </div>

                {address && (
                  <p className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
                    {fb.submit.sendingAsTemplate.replace(
                      '{address}',
                      `${address.slice(0, 6)}…${address.slice(-4)}`,
                    )}
                  </p>
                )}

                {error && (
                  <p
                    className="text-[13px] px-3.5 py-2.5"
                    style={{
                      color: '#b03d3a',
                      background: 'rgba(176,61,58,0.08)',
                      border: '1px solid rgba(176,61,58,0.30)',
                      borderRadius: 8,
                    }}
                  >
                    {error}
                  </p>
                )}

                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={submit}
                    disabled={busy}
                    className="inline-flex items-center gap-2 px-5 py-3 mono text-[12px] font-semibold uppercase tracking-[0.08em] bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] transition-colors disabled:opacity-60"
                    style={{
                      borderTopLeftRadius: 10,
                      borderTopRightRadius: 10,
                      borderBottomLeftRadius: 10,
                      borderBottomRightRadius: 3,
                    }}
                  >
                    {busy ? fb.submit.sending : fb.submit.cta}
                    {!busy && <span aria-hidden>→</span>}
                  </button>
                  <span className="text-[12px] text-[var(--lp-text-muted)]">
                    {fb.submit.noAccountNeeded}
                  </span>
                </div>
              </div>
            </PageCard>
          </div>
        )}
      </Band>
    </FullBleed>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)] mb-2">
        [:{label}:]
      </p>
      {children}
    </div>
  );
}

function SuccessCard({
  onReset,
  copy,
}: {
  onReset: () => void;
  copy: {
    headline: string;
    body: string;
    sendAnother: string;
    backToApp: string;
  };
}) {
  return (
    <div className="max-w-[560px]">
      <PageCard>
        <div className="p-8 text-center">
          <span
            aria-hidden
            className="inline-flex items-center justify-center w-12 h-12 mb-5"
            style={{
              background: 'var(--lp-band-dark)',
              color: 'var(--lp-accent)',
              borderTopLeftRadius: 14,
              borderTopRightRadius: 14,
              borderBottomLeftRadius: 14,
              borderBottomRightRadius: 4,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M5 12.5l4.2 4.2L19 7"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <h2 className="font-sans text-[24px] font-extrabold uppercase tracking-[-0.02em] text-[var(--lp-dark)]">
            {copy.headline}
            <span style={{ color: 'var(--lp-accent)' }}>.</span>
          </h2>
          <p className="mt-3 text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
            {copy.body}
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-2 px-5 py-3 mono text-[12px] font-semibold uppercase tracking-[0.08em] bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] transition-colors"
              style={{
                borderTopLeftRadius: 10,
                borderTopRightRadius: 10,
                borderBottomLeftRadius: 10,
                borderBottomRightRadius: 3,
              }}
            >
              {copy.sendAnother}
            </button>
            <Link
              href="/app"
              className="mono text-[12px] uppercase tracking-[0.10em] text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)]"
            >
              {copy.backToApp}
            </Link>
          </div>
        </div>
      </PageCard>
    </div>
  );
}
