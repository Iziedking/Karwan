/// The frame a video link shows on its Updates tile, so a video card needs no
/// uploaded picture. YouTube frames have a fixed address; Vimeo is asked once
/// through its public oEmbed endpoint and the answer is kept for a day.

import { logger } from '../logger.js';

const DAY_MS = 86_400_000;
const MISS_MS = 10 * 60_000;
export interface VideoFrame { image: string; videoSeconds?: number }
const cache = new Map<string, { at: number; ttl: number; frame: VideoFrame | null }>();

function youtubeId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, '');
  const id = host === 'youtu.be'
    ? url.pathname.slice(1)
    : host === 'youtube.com' || host === 'm.youtube.com'
      ? url.searchParams.get('v') ?? url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1] ?? null
      : null;
  return id && /^[\w-]{6,20}$/.test(id) ? id : null;
}

export async function videoThumbnail(href: string, fetcher: typeof fetch = fetch): Promise<VideoFrame | null> {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  const yt = youtubeId(url);
  if (yt) return { image: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` };
  if (url.hostname.replace(/^www\./, '') !== 'vimeo.com') return null;

  const hit = cache.get(href);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.frame;
  let found: VideoFrame | null = null;
  try {
    const res = await fetcher(`https://vimeo.com/api/oembed.json?width=960&url=${encodeURIComponent(href)}`, { signal: AbortSignal.timeout(3_000) });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const body = (await res.json()) as { thumbnail_url?: unknown; duration?: unknown };
    if (typeof body.thumbnail_url === 'string' && body.thumbnail_url.startsWith('https://i.vimeocdn.com/')) {
      found = { image: body.thumbnail_url };
      if (typeof body.duration === 'number' && body.duration > 0) found.videoSeconds = Math.round(body.duration);
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message, href }, 'updates: no video frame');
  }
  cache.set(href, { at: Date.now(), ttl: found ? DAY_MS : MISS_MS, frame: found });
  return found;
}

/// Video cards get their length, and their frame unless an admin set a picture.
export async function withThumbnails<T extends { kind: string; href: string; image?: string }>(cards: T[], fetcher: typeof fetch = fetch): Promise<Array<T & { videoSeconds?: number }>> {
  return Promise.all(cards.map(async (card) => {
    if (card.kind !== 'video') return card;
    const frame = await videoThumbnail(card.href, fetcher);
    if (!frame) return card;
    return { ...card, image: card.image || frame.image, ...(frame.videoSeconds ? { videoSeconds: frame.videoSeconds } : {}) };
  }));
}

export function __resetThumbnailCacheForTests(): void {
  cache.clear();
}
