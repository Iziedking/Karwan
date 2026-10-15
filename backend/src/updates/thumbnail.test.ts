import assert from 'node:assert/strict';
import test from 'node:test';
import { videoThumbnail, withThumbnails, __resetThumbnailCacheForTests } from './thumbnail.js';

const never = (async () => { throw new Error('no network expected'); }) as unknown as typeof fetch;
const respond = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

test('a YouTube link gives its frame without a network call', async () => {
  __resetThumbnailCacheForTests();
  for (const href of ['https://www.youtube.com/watch?v=abcDEF12345', 'https://youtu.be/abcDEF12345', 'https://youtube.com/shorts/abcDEF12345']) {
    assert.deepEqual(await videoThumbnail(href, never), { image: 'https://i.ytimg.com/vi/abcDEF12345/hqdefault.jpg' }, href);
  }
});

test('a Vimeo link asks Vimeo for its frame and keeps only a Vimeo image', async () => {
  __resetThumbnailCacheForTests();
  assert.deepEqual(await videoThumbnail('https://vimeo.com/1231989411', respond({ thumbnail_url: 'https://i.vimeocdn.com/video/9_960.jpg', duration: 116 })), { image: 'https://i.vimeocdn.com/video/9_960.jpg', videoSeconds: 116 });
  __resetThumbnailCacheForTests();
  assert.equal(await videoThumbnail('https://vimeo.com/1', respond({ thumbnail_url: 'https://evil.test/x.jpg' })), null);
  __resetThumbnailCacheForTests();
  assert.equal(await videoThumbnail('https://vimeo.com/1', respond({}, 404)), null);
});

test('other links have no frame', async () => {
  __resetThumbnailCacheForTests();
  assert.equal(await videoThumbnail('https://community.arc.network/post/1', never), null);
  assert.equal(await videoThumbnail('/how-it-works', never), null);
});

test('a video card keeps an admin picture and gains its length', async () => {
  __resetThumbnailCacheForTests();
  const vimeo = respond({ thumbnail_url: 'https://i.vimeocdn.com/video/9_960.jpg', duration: 116 });
  const cards = await withThumbnails([
    { kind: 'video', href: 'https://vimeo.com/1' },
    { kind: 'video', href: 'https://vimeo.com/1', image: '/media/own.jpg' },
    { kind: 'post', href: 'https://vimeo.com/1' },
  ], vimeo);
  assert.deepEqual(cards.map((c) => [c.image, c.videoSeconds]), [['https://i.vimeocdn.com/video/9_960.jpg', 116], ['/media/own.jpg', 116], [undefined, undefined]]);
});
