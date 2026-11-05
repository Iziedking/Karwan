import { z } from 'zod';
import { generateObject } from 'ai';
import { verifierModel } from '../llm/client.js';
import { withLlmRetry } from '../agents/llm-utils.js';
import { extractUrls } from './extractUrls.js';
import { logger } from '../logger.js';

/// The SecurityAgent's "did they deliver the right thing" check, distinct from
/// the link-safety scan ("is the link dangerous"). It reasons over the seller's
/// proof description plus the link's nature (a code repo, a design file, a drive
/// folder) against the buyer's requirement. It is a plausibility gate, not a
/// deep content audit: it catches gross mismatches (a backend brief delivered as
/// an unrelated link, an empty proof) and surfaces borderline ones. Advisory
/// only: it never rejects a delivery, it pauses auto-release so the buyer looks
/// before money moves. When no model answers, fixed proof rules decide
/// (proofRules): 'received' when the proof is in hand and safe, 'unknown' when
/// even that cannot be said. Neither blocks.

/// 'received': no model answered, and the fixed rules found the proof in hand.
/// It says nothing about whether the work matches; the buyer judges that.
export type RequirementVerdict = 'aligned' | 'partial' | 'mismatch' | 'received' | 'unknown';

export interface RequirementCheck {
  verdict: RequirementVerdict;
  reason: string;
}

const verdictSchema = z.object({
  verdict: z.enum(['aligned', 'partial', 'mismatch']),
  reason: z.string().describe('One short sentence.'),
});

export type LinkSafety = 'clean' | 'suspicious' | 'malicious' | 'unverifiable' | undefined;

/// The check Karwan can make without a model (owner, 5 Nov 2026): whether
/// the proof is in hand and every link in it passed the safety scan and
/// opened. It never says the work matches: only a person or a model judges
/// that. A held or unopened link leaves the verdict to them.
export function proofRules(input: { deliveryProof: string; linkSafety: LinkSafety }): RequirementCheck {
  const proof = input.deliveryProof.trim();
  if (proof.length < 3) return { verdict: 'unknown', reason: '' };
  const hasLink = extractUrls(proof).length > 0;
  if (hasLink && input.linkSafety !== 'clean') return { verdict: 'unknown', reason: '' };
  return { verdict: 'received', reason: '' };
}

export async function verifyDeliverable(input: {
  requirement: string;
  deliveryProof: string;
  /// The link scan's result for this proof. Without it a failed model leaves 'unknown'.
  linkSafety?: LinkSafety;
}): Promise<RequirementCheck> {
  const requirement = input.requirement.trim();
  const proof = input.deliveryProof.trim();
  // No requirement text or no proof: nothing to judge against. Don't guess.
  if (requirement.length < 3 || proof.length < 3) return { verdict: 'unknown', reason: '' };

  const linkKinds = extractUrls(proof).map((u) => linkKind(u.href));
  const linkSummary = linkKinds.length ? Array.from(new Set(linkKinds)).join(', ') : 'none';

  try {
    const { object } = await withLlmRetry('verifyDeliverable', () =>
      generateObject({
        model: verifierModel,
        schema: verdictSchema,
        prompt: buildPrompt(requirement, proof, linkSummary),
      }),
    );
    return { verdict: object.verdict, reason: object.reason.trim().slice(0, 240) };
  } catch (err) {
    // Never block a delivery on a model failure; warn-not-assure. Logged, so a
    // missing verdict can be traced to the provider that failed.
    logger.warn({ err: (err as Error).message }, 'delivery check: no model answered');
    return 'linkSafety' in input ? proofRules({ deliveryProof: proof, linkSafety: input.linkSafety }) : { verdict: 'unknown', reason: '' };
  }
}

function linkKind(url: string): string {
  const u = url.toLowerCase();
  if (/github|gitlab|bitbucket|npmjs|pypi/.test(u)) return 'code repo';
  if (/figma|dribbble|behance|canva/.test(u)) return 'design';
  if (/drive\.google|dropbox|onedrive|ipfs|\.zip/.test(u)) return 'file or folder';
  if (/youtu|vimeo|loom/.test(u)) return 'video';
  if (/docs\.google|notion|\.pdf|\.docx?/.test(u)) return 'document';
  return 'web link';
}

function buildPrompt(requirement: string, proof: string, linkSummary: string): string {
  return [
    'You review deliveries for an escrow platform. Decide whether a seller\'s delivery plausibly satisfies the buyer\'s request, BEFORE the buyer releases payment.',
    'You usually cannot open the link, so judge from the seller\'s description and the link type. Be fair: a terse but on-topic proof is "aligned". Only flag a clear topical mismatch or an empty, irrelevant proof. Never assume bad faith on thin evidence.',
    '',
    `BUYER REQUEST:\n${requirement}`,
    '',
    `SELLER DELIVERY PROOF:\n${proof}`,
    `DELIVERY LINK TYPE(S): ${linkSummary}`,
    '',
    'Verdicts:',
    '- "aligned": on-topic for the request.',
    '- "partial": on-topic but appears to cover only part of what was asked.',
    '- "mismatch": off-topic, unrelated, or clearly not what was requested.',
    'Prefer "aligned" when the topic matches. Give a one-sentence reason a buyer would understand.',
  ].join('\n');
}
