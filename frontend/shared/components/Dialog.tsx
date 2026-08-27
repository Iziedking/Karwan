'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Button } from '@/shared/components/Button';
import { FormError } from '@/shared/components/FormError';
import { dur, ease, spring } from '@/shared/motion/tokens';

interface ConfirmOpts {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
}

interface PromptOpts {
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
}

interface DialogApi {
  confirm: (options: ConfirmOpts) => Promise<boolean>;
  prompt: (options: PromptOpts) => Promise<string | null>;
  notify: (message: string, tone?: 'ok' | 'error') => void;
}

const DialogContext = createContext<DialogApi | null>(null);

export function useDialog(): DialogApi {
  const value = useContext(DialogContext);
  if (!value) throw new Error('useDialog must be used within a DialogProvider');
  return value;
}

type ActiveDialog =
  | { kind: 'confirm'; options: ConfirmOpts; resolve: (value: boolean) => void }
  | { kind: 'prompt'; options: PromptOpts; resolve: (value: string | null) => void };

interface ToastState {
  message: string;
  tone: 'ok' | 'error';
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<ActiveDialog | null>(null);
  const [value, setValue] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [mounted, setMounted] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const panelRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    setMounted(true);
    const query = window.matchMedia('(min-width: 640px)');
    const sync = () => setDesktop(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  const confirm = useCallback(
    (options: ConfirmOpts) =>
      new Promise<boolean>((resolve) => setActive({ kind: 'confirm', options, resolve })),
    [],
  );

  const prompt = useCallback(
    (options: PromptOpts) =>
      new Promise<string | null>((resolve) => {
        setValue(options.defaultValue ?? '');
        setActive({ kind: 'prompt', options, resolve });
      }),
    [],
  );

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = null;
    setToast(null);
  }, []);

  const scheduleToastDismiss = useCallback(
    (delay = 4000) => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(dismissToast, delay);
    },
    [dismissToast],
  );

  const notify = useCallback(
    (message: string, tone: 'ok' | 'error' = 'ok') => {
      setToast({ message, tone });
      scheduleToastDismiss();
    },
    [scheduleToastDismiss],
  );

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  useEffect(() => {
    if (!active) return;
    const dialog = active;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusFrame = window.requestAnimationFrame(() => {
      const target = dialog.kind === 'prompt'
        ? inputRef.current
        : panelRef.current?.querySelector<HTMLElement>('[data-dialog-cancel]');
      target?.focus();
    });

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeActive(dialog.kind === 'prompt' ? null : false);
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [active]);

  function closeActive(result: boolean | string | null) {
    if (!active) return;
    if (active.kind === 'confirm') active.resolve(result as boolean);
    else active.resolve(result as string | null);
    setActive(null);
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!active) return;
    closeActive(active.kind === 'prompt' ? value : true);
  }

  const provider = (
    <DialogContext.Provider value={{ confirm, prompt, notify }}>
      {children}
      {mounted
        ? createPortal(
            <>
              <AnimatePresence>
                {active ? (
                  <motion.div
                    key="dialog"
                    className="fixed inset-0 z-[200] flex items-end bg-black/60 sm:items-stretch sm:justify-end"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reduce ? 0 : dur.micro }}
                    onMouseDown={(event) => {
                      if (event.target === event.currentTarget) {
                        closeActive(active.kind === 'prompt' ? null : false);
                      }
                    }}
                  >
                    <motion.form
                      ref={panelRef}
                      onSubmit={onSubmit}
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="karwan-dialog-title"
                      aria-describedby={active.options.message ? 'karwan-dialog-message' : undefined}
                      className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[24px] border border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink)] shadow-[var(--shadow-pop)] sm:h-full sm:max-h-none sm:w-[440px] sm:rounded-none sm:rounded-s-[16px]"
                      initial={sheetHiddenState(reduce, desktop)}
                      animate={{ opacity: 1, x: 0, y: 0 }}
                      exit={sheetHiddenState(reduce, desktop)}
                      transition={reduce ? { duration: 0 } : spring.drawer}
                      onMouseDown={(event) => event.stopPropagation()}
                    >
                      <header className="border-b border-[var(--color-line)] px-6 pb-5 pt-6">
                        <p className="mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-faint)]">
                          • [:{active.kind === 'prompt' ? 'INPUT REQUIRED' : 'REVIEW ACTION'}]
                        </p>
                        <h2
                          id="karwan-dialog-title"
                          className="mt-3 font-sans text-[26px] font-bold leading-[1.02] tracking-[-0.025em]"
                        >
                          {active.options.title}
                        </h2>
                        {active.options.message ? (
                          <p
                            id="karwan-dialog-message"
                            className="mt-3 max-w-[38ch] text-[13px] leading-relaxed text-[var(--color-ink-dim)]"
                          >
                            {active.options.message}
                          </p>
                        ) : null}
                      </header>

                      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                        {active.kind === 'prompt' ? (
                          <label className="block">
                            <span className="mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">
                              • [:VALUE]
                            </span>
                            <input
                              ref={inputRef}
                              value={value}
                              onChange={(event) => setValue(event.target.value)}
                              placeholder={active.options.placeholder}
                              className="mt-2 min-h-12 w-full rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 font-mono text-[14px] text-[var(--color-ink)] outline-none transition-colors placeholder:text-[var(--color-ink-faint)] focus:border-[color-mix(in_srgb,var(--accent)_60%,transparent)]"
                            />
                          </label>
                        ) : active.options.danger ? (
                          <FormError eyebrow="CHECK">
                            This action may be difficult to reverse. Confirm the target before continuing.
                          </FormError>
                        ) : (
                          <p className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">
                            [:READY FOR YOUR DECISION]
                          </p>
                        )}
                      </div>

                      <footer className="grid grid-cols-2 gap-3 border-t border-[var(--color-line)] bg-[var(--color-surface-2)] px-6 py-5">
                        <Button
                          type="button"
                          variant="outline"
                          data-dialog-cancel
                          onClick={() => closeActive(active.kind === 'prompt' ? null : false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          variant={active.kind === 'confirm' && active.options.danger ? 'critical' : 'primary'}
                        >
                          {active.options.confirmLabel ?? (active.kind === 'prompt' ? 'Save' : 'Confirm')}
                        </Button>
                      </footer>
                    </motion.form>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              <AnimatePresence>
                {toast ? (
                  <motion.div
                    key={`${toast.tone}:${toast.message}`}
                    role="status"
                    aria-live="polite"
                    onMouseEnter={() => {
                      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
                    }}
                    onMouseLeave={() => scheduleToastDismiss(1800)}
                    initial={reduce ? { opacity: 0 } : { opacity: 0, x: 24, y: -8 }}
                    animate={{ opacity: 1, x: 0, y: 0 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, x: 16 }}
                    transition={{ duration: reduce ? 0 : dur.fast, ease: ease.out }}
                    className="fixed end-4 top-4 z-[210] w-[min(360px,calc(100vw-2rem))] rounded-[10px] border bg-[var(--color-surface)] px-4 py-3 shadow-[var(--shadow-pop)]"
                    style={{
                      borderColor: toast.tone === 'error' ? 'var(--neg)' : 'var(--pos)',
                    }}
                  >
                    <p
                      className="mono text-[10px] font-semibold uppercase tracking-[0.12em]"
                      style={{ color: toast.tone === 'error' ? 'var(--neg)' : 'var(--pos)' }}
                    >
                      • [:{toast.tone === 'error' ? 'ATTENTION' : 'DONE'}]
                    </p>
                    <p className="mt-1.5 text-[13px] leading-snug text-[var(--color-ink)]">
                      {toast.message}
                    </p>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </>,
            document.body,
          )
        : null}
    </DialogContext.Provider>
  );

  return provider;
}

function sheetHiddenState(reduce: boolean | null, desktop: boolean) {
  if (reduce) return { opacity: 0 };
  if (desktop) return { x: '100%' };
  return { y: '100%' };
}
