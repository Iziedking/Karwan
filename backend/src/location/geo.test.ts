import assert from 'node:assert/strict';
import test from 'node:test';
import { nominatimAdapter } from './geo.js';

type Hit = { lat: string; lon: string; category: string; type: string; place_rank: number };
const hit = (lat: number, lng: number, category: string, type: string, rank: number): Hit => ({ lat: String(lat), lon: String(lng), category, type, place_rank: rank });

function fakeFetch(answers: Array<Hit[] | Error | 'slow'>) {
  const urls: string[] = [];
  const headers: Array<Record<string, string>> = [];
  const fetcher = (async (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => {
    urls.push(url);
    headers.push(init?.headers ?? {});
    const next = answers.shift();
    if (next instanceof Error) throw next;
    if (next === 'slow') {
      return new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    }
    return new Response(JSON.stringify(next ?? []), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetcher, urls, headers };
}

const quick = { minGapMs: 0, timeoutMs: 50, contact: 'admin@karwan.site' };

test('an area is looked up as a place first, and read as an area (view 72)', async () => {
  const f = fakeFetch([[hit(9.11, 7.393, 'boundary', 'administrative', 14)]]);
  const geo = nominatimAdapter({ ...quick, fetcher: f.fetcher });
  const p = await geo.place('Gwarinpa, Abuja', 'NG');
  assert.deepEqual(p, { lat: 9.11, lng: 7.393, precision: 'area' });
  assert.match(f.urls[0], /featureType=settlement/);
  assert.match(f.urls[0], /countrycodes=ng/);
  assert.match(f.headers[0]['User-Agent'], /^Karwan\/1\.0 \(admin@karwan\.site\)$/);
});

test('a name it does not know as a place falls back to any result inside it', async () => {
  const f = fakeFetch([[], [hit(9.07, 7.479, 'amenity', 'restaurant', 30)]]);
  const p = await nominatimAdapter({ ...quick, fetcher: f.fetcher }).place('Wuse 2, Abuja', 'NG');
  assert.deepEqual(p, { lat: 9.07, lng: 7.479, precision: 'area' });
  assert.equal(f.urls.length, 2);
  assert.doesNotMatch(f.urls[1], /featureType/);
});

test('a city is read as a city', async () => {
  const f = fakeFetch([[hit(9.918, 8.898, 'place', 'city', 16)]]);
  assert.equal((await nominatimAdapter({ ...quick, fetcher: f.fetcher }).place('Jos', 'NG'))?.precision, 'city');
});

test('only what they typed and the country are sent, and the same place is never asked twice', async () => {
  const f = fakeFetch([[hit(9.013, 7.481, 'place', 'suburb', 19)]]);
  const geo = nominatimAdapter({ ...quick, fetcher: f.fetcher });
  await geo.place('Garki, Abuja', 'NG');
  await geo.place('  garki, abuja ', 'ng');
  assert.equal(f.urls.length, 1);
  const q = new URL(f.urls[0]).searchParams;
  assert.deepEqual([...q.keys()].sort(), ['countrycodes', 'featureType', 'format', 'layer', 'limit', 'q']);
});

test('no answer, an error or a slow answer gives null, never a throw', async () => {
  assert.equal(await nominatimAdapter({ ...quick, fetcher: fakeFetch([[], []]).fetcher }).place('Nowhere', 'NG'), null);
  assert.equal(await nominatimAdapter({ ...quick, fetcher: fakeFetch([new Error('offline')]).fetcher }).place('Yaba', 'NG'), null);
  assert.equal(await nominatimAdapter({ ...quick, fetcher: fakeFetch(['slow']).fetcher }).place('Yaba', 'NG'), null);
  assert.equal(await nominatimAdapter({ ...quick, fetcher: fakeFetch([]).fetcher }).place('   ', 'NG'), null);
});

test('calls wait their turn: at most one a second across Karwan', async () => {
  const f = fakeFetch([[hit(1, 1, 'place', 'city', 16)], [hit(2, 2, 'place', 'city', 16)]]);
  const geo = nominatimAdapter({ ...quick, minGapMs: 120, fetcher: f.fetcher });
  const started = Date.now();
  await Promise.all([geo.place('Owerri', 'NG'), geo.place('Jos', 'NG')]);
  assert.ok(Date.now() - started >= 110, 'the second call waited');
});
