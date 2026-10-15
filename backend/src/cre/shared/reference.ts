// Copied from cre/shared by scripts/cre-shared-sync.mjs. Edit cre/shared, then run the script.
import { z } from 'zod';
import type { Hex } from 'viem';
import { fingerprint } from './canonical.js';
import { repositorySchema } from './policy.js';

/// What the seller delivered, pinned to a commit. Its fingerprint is the
/// `proofHash` passed to `markDelivered`, so a force-push changes nothing.
export const referenceSchema = z.object({
  repository: repositorySchema,
  pull: z.number().int().positive(),
  sha: z.string().regex(/^[0-9a-f]{40}$/),
}).strict();

export type DeliveryReference = z.infer<typeof referenceSchema>;

export const proofFingerprint = (r: DeliveryReference): Hex => fingerprint(referenceSchema.parse(r));
