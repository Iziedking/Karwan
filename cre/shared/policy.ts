import { z } from 'zod';
import type { Hex } from 'viem';
import { fingerprint } from './canonical.js';

/// What both parties agree "done" means for a software deal. Its fingerprint
/// is the deal's `checkPolicy` on Arc, so it cannot change after funding.
export const REPLAY_POLICY = 'karwan.replay.github.v1';

const owner = z.string().regex(/^[A-Za-z0-9-]{1,39}$/);
const repoName = z.string().regex(/^[A-Za-z0-9_.-]{1,100}$/);
/// One printable line: commands travel to the runner through env, never
/// through the workflow file, and a newline would start a second command.
const runLine = z.string().min(1).max(500).regex(/^[\x20-\x7E]+$/);

export const repositorySchema = z.object({ owner, name: repoName, id: z.number().int().positive() }).strict();

export const policySchema = z.object({
  policy: z.literal(REPLAY_POLICY),
  repository: repositorySchema,
  baseBranch: z.string().min(1).max(255).regex(/^[\x21-\x7E]+$/),
  delivery: z.enum(['pull', 'commit']),
  setup: runLine.optional(),
  items: z.array(z.object({
    id: z.string().regex(/^[a-z0-9]{1,8}$/),
    title: z.string().min(1).max(140),
    run: runLine,
    required: z.boolean(),
  }).strict()).min(1).max(12),
  partialAt: z.number().int().positive().nullable(),
  runner: z.object({
    repository: z.string().regex(/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9_.-]{1,100}$/),
    workflow: z.literal('.github/workflows/replay.yml'),
    blobSha: z.string().regex(/^[0-9a-f]{40}$/),
  }).strict(),
  timeoutMinutes: z.number().int().min(5).max(60),
}).strict();

export type AcceptancePolicy = z.infer<typeof policySchema>;

export function parsePolicy(raw: unknown, opts: { partialAllowed: boolean }): AcceptancePolicy {
  const p = policySchema.parse(raw);
  if (new Set(p.items.map((i) => i.id)).size !== p.items.length) throw new Error('POLICY_DUPLICATE_ITEM');
  const required = p.items.filter((i) => i.required).length;
  if (required === 0) throw new Error('POLICY_NO_REQUIRED_ITEM');
  if (p.partialAt !== null && (!opts.partialAllowed || p.partialAt >= required)) throw new Error('POLICY_PARTIAL_LINE');
  return p;
}

export const policyFingerprint = (p: AcceptancePolicy): Hex => fingerprint(p);
