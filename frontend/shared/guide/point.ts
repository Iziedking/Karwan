/// Show me (view 57, 17 Nov): a link with ?point=<id> lights one part of the
/// page. Only a plain id is read, before anything on the page is touched.

import { pointLines, type PointId } from '../i18n/messages/pointLines';

export const POINT_MS = 8000;

const PLAIN = /^[a-z0-9-]{2,40}$/;

export function pointFromUrl(search: string): string | null {
  const id = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('point');
  return id && PLAIN.test(id) ? id : null;
}

/// The query without `point`, with its leading `?`, or '' when nothing is left.
export function withoutPoint(search: string): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  params.delete('point');
  const rest = params.toString();
  return rest ? `?${rest}` : '';
}

/// A point we have a line for. Own keys only, so `constructor` is not one.
export function isPoint(id: string): id is PointId {
  return Object.hasOwn(pointLines.en, id);
}
