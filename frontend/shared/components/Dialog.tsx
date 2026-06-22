'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

/// In-app confirm / prompt / toast, replacing the browser's window.confirm,
/// window.prompt and window.alert. Promise-based so call sites read like the
/// native ones: `if (await confirm({...})) ...`, `const v = await prompt({...})`.

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
  confirm: (o: ConfirmOpts) => Promise<boolean>;
  prompt: (o: PromptOpts) => Promise<string | null>;
  notify: (message: string, tone?: 'ok' | 'error') => void;
}

const Ctx = createContext<DialogApi | null>(null);

export function useDialog(): DialogApi {
  const c = useContext(Ctx);
  if (!c) throw new Error('useDialog must be used within a DialogProvider');
  return c;
}

type Active =
  | { kind: 'confirm'; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | { kind: 'prompt'; opts: PromptOpts; resolve: (v: string | null) => void };

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<Active | null>(null);
  const [value, setValue] = useState('');
  const [toast, setToast] = useState<{ message: string; tone: 'ok' | 'error' } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const confirm = useCallback(
    (opts: ConfirmOpts) =>
      new Promise<boolean>((resolve) => setActive({ kind: 'confirm', opts, resolve })),
    [],
  );
  const prompt = useCallback(
    (opts: PromptOpts) =>
      new Promise<string | null>((resolve) => {
        setValue(opts.defaultValue ?? '');
        setActive({ kind: 'prompt', opts, resolve });
      }),
    [],
  );
  const notify = useCallback((message: string, tone: 'ok' | 'error' = 'ok') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, tone });
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  useEffect(() => {
    if (active?.kind === 'prompt') inputRef.current?.focus();
  }, [active]);

  function close(result: boolean | string | null) {
    if (!active) return;
    if (active.kind === 'confirm') active.resolve(result as boolean);
    else active.resolve(result as string | null);
    setActive(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!active) return;
    close(active.kind === 'prompt' ? value : true);
  }

  return (
    <Ctx.Provider value={{ confirm, prompt, notify }}>
      {children}

      {active && (
        <div
          className="fixed inset-0 z-[200] grid place-items-center bg-black/60 px-4"
          onKeyDown={(e) => {
            if (e.key === 'Escape') close(active.kind === 'prompt' ? null : false);
          }}
        >
          <form
            onSubmit={onSubmit}
            className="w-full max-w-[400px] bg-[#161616] border border-white/12 rounded-2xl p-6 shadow-[0_24px_64px_-20px_rgba(0,0,0,0.6)]"
          >
            <p className="font-sans text-[16px] font-extrabold text-white">{active.opts.title}</p>
            {active.opts.message && (
              <p className="mt-2 text-[13px] leading-relaxed text-white/55">{active.opts.message}</p>
            )}
            {active.kind === 'prompt' && (
              <input
                ref={inputRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={active.opts.placeholder}
                className="mt-4 w-full bg-[#0e0e0e] border border-white/15 rounded-lg px-3 py-2.5 text-[14px] text-white font-mono focus:border-white/40 outline-none"
              />
            )}
            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => close(active.kind === 'prompt' ? null : false)}
                className="mono text-[11px] uppercase tracking-[0.1em] px-4 py-2.5 rounded-lg text-white/55 hover:text-white hover:bg-white/5 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="mono text-[11px] uppercase tracking-[0.1em] font-bold px-4 py-2.5 rounded-lg transition"
                style={
                  active.kind === 'confirm' && active.opts.danger
                    ? { background: '#b25425', color: '#fff' }
                    : { background: '#fff', color: '#0e0e0e' }
                }
              >
                {active.opts.confirmLabel ?? (active.kind === 'prompt' ? 'Save' : 'Confirm')}
              </button>
            </div>
          </form>
        </div>
      )}

      {toast && (
        <div
          className="fixed z-[210] bottom-5 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-lg text-[13px] font-medium shadow-[0_12px_32px_-12px_rgba(0,0,0,0.6)]"
          style={
            toast.tone === 'error'
              ? { background: '#3a1c12', color: '#f0b49a', border: '1px solid #6b3320' }
              : { background: '#15301c', color: '#9fe0b0', border: '1px solid #2c5a39' }
          }
        >
          {toast.message}
        </div>
      )}
    </Ctx.Provider>
  );
}
