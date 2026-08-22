import { ZodError, type ZodIssue } from 'zod';

/// What to say when a request does not validate.
///
/// Every route answered this the same way: `detail: (err as Error).message`,
/// which for a Zod failure is the ISSUE ARRAY serialised as JSON. It reached the
/// user verbatim. A buyer who typed a four-letter request got
///
///   Couldn't post: [ { "code": "too_small", "minimum": 5, "type": "string",
///   "inclusive": true, "exact": false, "message": "String must contain at
///   least 5 character(s)", "path": [ "brief" ] } ]
///
/// printed under the button. The information the reader needed was in there:
/// the request is too short. Everything else was our schema.
///
/// So this turns the FIRST issue into one sentence naming the field. First, not
/// all of them: a form reports one problem at a time, and the second issue is
/// usually a consequence of the first.

/// Field names a user recognises. A path segment with no entry here is spaced
/// out from camelCase, which is right for `mintRecipient` and harmless for the
/// rest.
const FIELD_LABELS: Record<string, string> = {
  brief: 'Request',
  briefText: 'Request',
  budgetUsdc: 'Budget',
  amountUsdc: 'Amount',
  deadlineDays: 'Deadline',
  deadlineSeconds: 'Deadline',
  tolerancePct: 'Tolerance',
  milestonePcts: 'Milestone split',
  posterAddress: 'Wallet address',
  mintRecipient: 'Recipient address',
  toAddress: 'Recipient address',
  jobId: 'Deal reference',
  body: 'Message',
  terms: 'Terms',
};

function fieldLabel(issue: ZodIssue): string {
  const segment = [...issue.path].reverse().find((part) => typeof part === 'string');
  if (!segment) return 'This request';
  const key = String(segment);
  if (FIELD_LABELS[key]) return FIELD_LABELS[key]!;
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function sentenceFor(issue: ZodIssue): string {
  const field = fieldLabel(issue);
  switch (issue.code) {
    case 'too_small': {
      const min = Number(issue.minimum);
      if (issue.type === 'string') {
        return min === 1
          ? `${field} cannot be empty.`
          : `${field} needs at least ${min} characters.`;
      }
      if (issue.type === 'array') return `${field} needs at least ${min} entries.`;
      return `${field} must be at least ${min}.`;
    }
    case 'too_big': {
      const max = Number(issue.maximum);
      if (issue.type === 'string') return `${field} can be at most ${max} characters.`;
      if (issue.type === 'array') return `${field} can have at most ${max} entries.`;
      return `${field} can be at most ${max}.`;
    }
    case 'invalid_type':
      return issue.received === 'undefined' || issue.received === 'null'
        ? `${field} is required.`
        : `${field} is not in the expected format.`;
    case 'invalid_enum_value':
    case 'invalid_literal':
      return `${field} is not one of the accepted values.`;
    case 'invalid_string':
      return `${field} is not valid.`;
    default:
      return `${field} is not valid.`;
  }
}

/// One sentence for the client, for any thrown validation error.
export function invalidBodyMessage(err: unknown): string {
  if (err instanceof ZodError && err.issues.length > 0) {
    return sentenceFor(err.issues[0]!);
  }
  // A body that is not JSON at all, or a schema that threw something else.
  // Nothing about the internals belongs in the answer.
  return 'This request was not valid. Check the details and try again.';
}
