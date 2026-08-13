/// The published product canon, as the assistant's source of truth about what
/// Karwan actually does.
///
/// Until now the assistant answered from `knowledge.ts`, a prompt written by
/// hand. That is a second copy of the product's claims, kept in step with the
/// real one by memory, and this repo has a record of what that costs: a live
/// answer once described gas as sponsored by a Gas Station that was never
/// wired, and a submission claimed capabilities that had not shipped. The canon
/// exists precisely to stop that, because every entry carries whether it may be
/// stated in the present tense and, when it may not, why.
///
/// ## Why a vendored file and not the MCP server
///
/// karwan-content-os publishes this same data over MCP, and the team server is
/// deployed. Reaching for it from here would put a network hop, an auth story
/// and a new failure mode into every chat turn, to read 23KB of static text
/// that changes when someone edits a markdown file. The snapshot is committed,
/// diffable, and versioned; `npm run sync:canon` refreshes it. The MCP server
/// remains the right answer for clients OUTSIDE this process.
///
/// The trade is real and worth naming: this copy can go stale. `canonVersion`
/// is returned with every answer so a stale snapshot is visible rather than
/// silent, and the sync script is one command.

/// A static import rather than a runtime read, so `tsc` resolves it and emits
/// the file into `dist/` alongside the code. A `createRequire` here typechecks
/// perfectly and then throws MODULE_NOT_FOUND in production, because the
/// compiler never sees the path and never copies the file.
import snapshot from './canon/canon.public.json' with { type: 'json' };

export interface PublicFact {
  id: string;
  title: string;
  status: string;
  /// Whether this may be stated in the present tense. The single most important
  /// field in the file.
  publishable: boolean;
  /// Why not, when it is not. `not-a-capability` means the entry is reference
  /// material such as brand or FAQ and is free to use; `not-live` and
  /// `stale-check` mean the claim is barred.
  blockedBy: string | null;
  capability: boolean;
  audience: string;
  tags: string[];
  summary: string;
  sources: Array<{ url: string; date: string }>;
  updated: string;
  path: string;
}

export interface PublicDoc {
  id: string;
  title: string;
  status: string;
  updated: string;
  tags: string[];
  path: string;
  body: string;
}

export const canonVersion: string = snapshot.canonVersion;
export const canonUpdated: string = snapshot.canonUpdated;

const allFacts = snapshot.facts as unknown as PublicFact[];
const allDocs = snapshot.docs as unknown as PublicDoc[];

/// A claim may be stated outright when it is publishable, or when it was only
/// held back for not being a capability at all. Brand and FAQ entries fall in
/// the second group and are ordinary reference material.
export function isStatable(fact: PublicFact): boolean {
  return fact.publishable || fact.blockedBy === 'not-a-capability';
}

export interface FactQuery {
  q?: string;
  /// Capabilities only, and only ones that may be described in the present
  /// tense. This is what to ask for when the user wants to know what they can
  /// do right now.
  liveOnly?: boolean;
}

/// Every term must match, so more terms narrow rather than widen. Matching the
/// content kit's own behaviour: a search that ORs terms returns the whole canon
/// for any two-word question, which is the same as returning nothing useful.
export function findFacts(query: FactQuery = {}): PublicFact[] {
  let found = allFacts;
  if (query.liveOnly) found = found.filter((f) => f.capability && f.publishable);
  if (query.q) {
    const terms = query.q.toLowerCase().split(/\s+/).filter(Boolean);
    found = found.filter((f) => {
      const haystack = `${f.id} ${f.title} ${f.summary} ${f.tags.join(' ')}`.toLowerCase();
      return terms.every((t) => haystack.includes(t));
    });
  }
  return found;
}

/// The prose behind a fact. Returned separately from the fact index because the
/// index is what decides whether a thing may be said, and the body is only how
/// to say it.
export function findDocs(ids: string[]): PublicDoc[] {
  const wanted = new Set(ids);
  return allDocs.filter((d) => wanted.has(d.id));
}
