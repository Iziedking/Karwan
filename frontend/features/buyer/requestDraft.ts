/// A request being written, kept for this visit so leaving to add money, or a
/// page that reloads after a top-up, never throws it away (owner notes, 4 Nov
/// 2026). Only what the person typed is kept; it is cleared once the request posts.

export interface RequestDraft {
  brief: string;
  budget: number | '';
  deadlineValue: number | '';
  deadlineUnit: 'min' | 'hr' | 'd';
  tolerance: number | '';
}

export const REQUEST_DRAFT_KEY = 'karwan:request-draft:v1';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const store = (): Store | null => {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
};

const isAmount = (v: unknown): v is number | '' => v === '' || (typeof v === 'number' && Number.isFinite(v));

export function loadRequestDraft(from: Store | null = store()): RequestDraft | null {
  try {
    const raw = from?.getItem(REQUEST_DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<RequestDraft>;
    if (typeof d.brief !== 'string' || !isAmount(d.budget) || !isAmount(d.deadlineValue) || !isAmount(d.tolerance)) return null;
    if (d.deadlineUnit !== 'min' && d.deadlineUnit !== 'hr' && d.deadlineUnit !== 'd') return null;
    return d as RequestDraft;
  } catch {
    return null;
  }
}

export function saveRequestDraft(draft: RequestDraft, to: Store | null = store()): void {
  try {
    // An empty form leaves nothing behind.
    if (!draft.brief.trim() && draft.budget === '' && draft.deadlineValue === '') to?.removeItem(REQUEST_DRAFT_KEY);
    else to?.setItem(REQUEST_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* storage full or blocked: the form still works, it just is not kept */
  }
}

export function clearRequestDraft(from: Store | null = store()): void {
  try {
    from?.removeItem(REQUEST_DRAFT_KEY);
  } catch {
    /* nothing to clear */
  }
}
