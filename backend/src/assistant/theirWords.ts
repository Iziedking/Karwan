/// Other people's words reach the model fenced off (view 57, 17 Nov).
///
/// A tool result carries text written by other people: an offer's title, a
/// buyer's brief, a display name, a message. The model reads it inside a fence
/// so it is information about them, never an instruction. The system prompt
/// (knowledge.ts) says what a fence means.

const OPEN = '⟦';
const CLOSE = '⟧';
const END = `${OPEN}end${CLOSE}`;
const MARKERS = /[⟦⟧]/g;
const FENCED = /⟦their words · [^⟦⟧]*⟧([\s\S]*?)⟦end⟧/g;
const MAX_DEPTH = 12;

/// Keys whose string values are written by people other than Karwan.
export const THEIR_KEYS: ReadonlySet<string> = new Set([
  'displayName', 'name', 'handle', 'title', 'description', 'brief', 'body', 'message', 'text',
  'note', 'deliveryNote', 'reason', 'statement', 'review', 'comment', 'bio', 'about', 'entry',
]);

/// At the top of a result these keys are how our own tools talk to the model
/// ("note: Say it in one line"), so they stay plain there and are fenced deeper.
export const OUR_TOP_KEYS: ReadonlySet<string> = new Set(['note', 'reason', 'message']);

/// A tool whose own copy sits under one of the keys above, by tool name, with why.
export const OUR_TEXT: Record<string, { keys: string[]; why: string }> = {};

export function fence(text: string, who: string): string {
  const name = who.replace(MARKERS, '').trim() || 'someone';
  return `${OPEN}their words · ${name}${CLOSE}${text.replace(MARKERS, '')}${END}`;
}

/// The words without their fences, for an answer the person reads and for the
/// arguments the model hands back to a tool.
export function unfence(text: string): string {
  return text.replace(FENCED, '$1').replace(MARKERS, '');
}

function writerOf(path: readonly string[]): string {
  for (let i = path.length - 1; i >= 0; i -= 1) {
    if (!/^\d+$/.test(path[i]!)) return path[i]!;
  }
  return 'someone';
}

export function fenceResult(value: unknown, keys: ReadonlySet<string> = THEIR_KEYS, who: (path: string[]) => string = writerOf): unknown {
  const walk = (v: unknown, path: string[]): unknown => {
    if (path.length > MAX_DEPTH || v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map((item, i) => walk(item, [...path, String(i)]));
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(v as Record<string, unknown>)) {
      const ours = path.length === 0 && OUR_TOP_KEYS.has(key);
      out[key] = typeof inner === 'string' && keys.has(key) && !ours ? fence(inner, who(path)) : walk(inner, [...path, key]);
    }
    return out;
  };
  return walk(value, []);
}

function cleanArgs(v: unknown, depth = 0): unknown {
  if (typeof v === 'string') return unfence(v);
  if (depth > MAX_DEPTH || v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((item) => cleanArgs(item, depth + 1));
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, inner]) => [k, cleanArgs(inner, depth + 1)]));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTool = { execute?: (args: any, options: any) => unknown };

/// Wraps every tool: the arguments lose any fence the model copied into them,
/// and the result has other people's words fenced. Applied around every tool
/// set the agent builds, so every channel gets it.
export function withTheirWordsFenced<T extends Record<string, AnyTool>>(tools: T): T {
  const out: Record<string, AnyTool> = {};
  for (const [name, t] of Object.entries(tools)) {
    if (!t.execute) {
      out[name] = t;
      continue;
    }
    const run = t.execute;
    const skip = OUR_TEXT[name]?.keys ?? [];
    const keys = skip.length ? new Set([...THEIR_KEYS].filter((k) => !skip.includes(k))) : THEIR_KEYS;
    out[name] = { ...t, execute: async (args: unknown, options: unknown) => fenceResult(await run(cleanArgs(args), options), keys) };
  }
  return out as T;
}
