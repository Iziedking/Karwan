'use client';
import { useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import Link from 'next/link';
import { DEALS_AVAILABLE } from '@/core/arcNetwork';
import { WALLET_HOME } from '@/shared/utils/routes';
import { api } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { FullBleed, Band, PageCard } from '@/shared/components/Bands';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { Icon } from '@/shared/components/Icon';

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
    } catch {
      setError(fb.errors.submitFailed);
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

  const inputClass =
    'min-h-12 w-full rounded-xl border border-[var(--lp-border-light)] bg-[var(--lp-light)] px-3.5 py-3 text-[15px] text-[var(--lp-dark)] outline-none transition-colors placeholder:text-[var(--lp-text-muted)] focus:border-[var(--lp-accent)]';

  return (
    <FullBleed>
      <Band tone="light">
        <div className="mx-auto w-full max-w-[600px]" data-feedback-page="">
          <header className="flex flex-col items-center text-center">
            <span className="fade-up fade-up-1 inline-flex items-center gap-2 rounded-full border border-[var(--lp-border-light)] bg-[var(--lp-card)] px-3 py-1.5 text-[13px] font-medium text-[var(--lp-text-sub)]">
              <span aria-hidden className="size-1.5 rounded-full bg-[var(--lp-accent)]" />
              {fb.hero.tag}
            </span>
            <h1 className="fade-up fade-up-2 mt-4 text-balance text-[32px] font-bold leading-[1.1] tracking-[-0.025em] text-[var(--lp-dark)] md:text-[48px]">
              {fb.hero.headline}
              <span className="text-[var(--lp-accent)]">.</span>
            </h1>
            <p className="fade-up fade-up-3 mt-3 max-w-[46ch] text-pretty text-[15px] leading-relaxed text-[var(--lp-text-sub)] md:text-[17px]">
              {fb.hero.body}
            </p>
          </header>

          <div className="mt-8 md:mt-10">
            {doneId ? (
              <SuccessCard onReset={reset} copy={fb.success} />
            ) : (
              <PageCard>
                <form
                  className="space-y-6 p-5 md:p-7"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submit();
                  }}
                >
                  <fieldset>
                    <legend className="mb-2.5 text-[13px] font-semibold text-[var(--lp-text-sub)]">
                      {fb.fields.categoryEyebrow}
                    </legend>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {CATEGORY_KEYS.map((key) => {
                        const on = category === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setCategory(key)}
                            aria-pressed={on}
                            data-feedback-kind={key}
                            className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border px-4 text-[14px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lp-accent)] ${
                              on
                                ? 'border-[var(--lp-dark)] bg-[var(--lp-light)] font-semibold text-[var(--lp-dark)]'
                                : 'border-[var(--lp-border-light)] font-medium text-[var(--lp-text-sub)] hover:border-[var(--lp-text-muted)] hover:text-[var(--lp-dark)]'
                            }`}
                          >
                            {on && <Icon name="check" size={16} />}
                            {fb.categories[key].label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-2.5 text-[13px] text-[var(--lp-text-muted)]">{fb.categories[category].blurb}</p>
                  </fieldset>

                  <Field label={fb.fields.titleEyebrow} htmlFor="feedback-title">
                    <input
                      id="feedback-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      maxLength={140}
                      placeholder={fb.placeholders.title}
                      className={inputClass}
                    />
                  </Field>

                  <Field label={fb.fields.messageEyebrow} htmlFor="feedback-message">
                    <div
                      onPaste={onPaste}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragging(true);
                      }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={onDrop}
                      data-feedback-message=""
                      className={`overflow-hidden rounded-xl border bg-[var(--lp-light)] transition-colors focus-within:border-[var(--lp-accent)] ${
                        dragging ? 'border-[var(--lp-accent)]' : 'border-[var(--lp-border-light)]'
                      }`}
                    >
                      <textarea
                        id="feedback-message"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        maxLength={4000}
                        rows={5}
                        placeholder={fb.placeholders.message}
                        className="block min-h-[136px] w-full resize-y bg-transparent px-3.5 py-3 text-[15px] leading-relaxed text-[var(--lp-dark)] outline-none placeholder:text-[var(--lp-text-muted)]"
                      />
                      {shots.length > 0 && (
                        <div className="grid grid-cols-4 gap-2 px-3 pb-3">
                          {shots.map((s, i) => (
                            <div key={i} className="relative overflow-hidden rounded-lg border border-[var(--lp-border-light)]">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={s.dataUrl} alt={s.name} className="block h-16 w-full object-cover" />
                              <button
                                type="button"
                                onClick={() => removeShot(i)}
                                aria-label={fb.dropZone.removeAria}
                                className="absolute end-1 top-1 inline-flex size-6 items-center justify-center rounded-md bg-black/60 text-white transition-colors hover:bg-black/80"
                              >
                                <Icon name="close" size={16} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-3 border-t border-[var(--lp-border-light)] py-2 pe-3.5 ps-2">
                        <button
                          type="button"
                          onClick={() => fileInput.current?.click()}
                          disabled={shots.length >= MAX_SHOTS}
                          className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-[10px] bg-[var(--lp-card)] px-3 text-[13px] font-semibold text-[var(--lp-dark)] transition-colors hover:bg-[var(--lp-border-light)] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lp-accent)]"
                        >
                          <Icon name="paperclip" size={16} />
                          {fb.dropZone.attach}
                        </button>
                        <span className="text-end text-[13px] text-[var(--lp-text-muted)]">
                          {fb.dropZone.countTemplate
                            .replace('{n}', String(shots.length))
                            .replace('{max}', String(MAX_SHOTS))}
                        </span>
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
                    </div>
                  </Field>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={fb.fields.whereEyebrow} htmlFor="feedback-where">
                      <input
                        id="feedback-where"
                        value={where}
                        onChange={(e) => setWhere(e.target.value)}
                        maxLength={500}
                        placeholder={fb.placeholders.where}
                        className={inputClass}
                      />
                    </Field>
                    <Field label={fb.fields.contactEyebrow} htmlFor="feedback-contact">
                      <input
                        id="feedback-contact"
                        value={contact}
                        onChange={(e) => setContact(e.target.value)}
                        maxLength={200}
                        placeholder={fb.placeholders.contact}
                        className={inputClass}
                      />
                    </Field>
                  </div>

                  {error && (
                    <p
                      role="alert"
                      className="border-s-2 px-3.5 py-2 text-[14px] leading-relaxed"
                      style={{ color: 'var(--neg)', borderColor: 'var(--neg)' }}
                    >
                      {error}
                    </p>
                  )}

                  <div className="space-y-3">
                    <button
                      type="submit"
                      disabled={busy}
                      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--lp-accent)] px-5 text-[15px] font-semibold text-[var(--lp-band-dark)] transition-colors hover:bg-[var(--lp-accent-hover)] disabled:opacity-60"
                    >
                      {busy ? fb.submit.sending : fb.submit.cta}
                      {!busy && <Icon name="arrow-right" size={16} directional />}
                    </button>
                    <p className="text-center text-[13px] text-[var(--lp-text-muted)]">
                      {address
                        ? fb.submit.sendingAsTemplate.replace('{address}', `${address.slice(0, 6)}…${address.slice(-4)}`)
                        : fb.submit.noAccountNeeded}
                    </p>
                  </div>
                </form>
              </PageCard>
            )}
          </div>
        </div>
      </Band>
    </FullBleed>
  );
}

/// A label over its field. "Where (optional)" shows the part in brackets as a
/// quiet word beside the name, in every language.
function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  const match = /^(.*?)\s*[（(](.+)[)）]\s*$/.exec(label);
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-2 flex items-baseline gap-1.5 text-[13px] font-semibold text-[var(--lp-text-sub)]"
      >
        {match ? match[1] : label}
        {match && <span className="font-normal text-[var(--lp-text-muted)]">{match[2]}</span>}
      </label>
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
    <div data-feedback-sent="">
      <PageCard>
        <div className="p-8 text-center" role="status">
          <span
            aria-hidden
            className="mb-5 inline-flex size-12 items-center justify-center rounded-full border border-[var(--lp-border-light)] bg-[var(--lp-light)] text-[var(--lp-accent)]"
          >
            <Icon name="check" size={24} />
          </span>
          <h2 className="text-[24px] font-bold tracking-[-0.02em] text-[var(--lp-dark)]">{copy.headline}</h2>
          <p className="mx-auto mt-3 max-w-[42ch] text-[15px] leading-relaxed text-[var(--lp-text-sub)]">
            {copy.body}
          </p>
          <div className="mt-6 flex flex-col items-stretch justify-center gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={onReset}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--lp-accent)] px-5 text-[15px] font-semibold text-[var(--lp-band-dark)] transition-colors hover:bg-[var(--lp-accent-hover)]"
            >
              {copy.sendAnother}
            </button>
            <Link
              href={DEALS_AVAILABLE ? '/app' : WALLET_HOME}
              className="inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-[15px] font-semibold text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)]"
            >
              {copy.backToApp}
            </Link>
          </div>
        </div>
      </PageCard>
    </div>
  );
}
