import { z } from 'zod';

/// Switch-on day in epoch milliseconds. Anything below 2001-09-09 in ms is
/// almost certainly seconds, which would make every past deal count as after
/// switch-on and publish the whole history, so it is refused at startup.
/// Kept apart from policy.ts so config.ts imports nothing from the database:
/// the frontend type-checks config.ts and its build has no backend packages.
export const startAtSchema = z.preprocess(
  (v) => (v === '' ? undefined : v),
  z.coerce.number().int().min(1_000_000_000_000, 'ATTESTATION_START_AT must be epoch milliseconds').optional(),
);
