import { bodyLimit } from 'hono/body-limit';

/// One ceiling for every request body (view 69). The largest legitimate body
/// is feedback: 12 MB of screenshots as base64, about 16.5 MB. Routes keep
/// their own tighter per-file checks.
export const MAX_REQUEST_BYTES = 20 * 1024 * 1024;

export const requestSizeLimit = bodyLimit({
  maxSize: MAX_REQUEST_BYTES,
  onError: (c) => c.json({ error: 'request too large', code: 'request_too_large' }, 413),
});
