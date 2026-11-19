// Builds Karwan's own town list from GeoNames (geonames.org, CC BY 4.0):
//   node scripts/places/build-places.mjs <cities15000.txt> <admin1CodesASCII.txt> <towns.json> <tzCountry.json>
// towns.json: [name, admin, country, lat, lng, population], by country then
// population, biggest first. tzCountry.json: time zone -> the country with the
// most towns in it, so a phone's time zone can guess the country.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const [citiesPath, adminPath, townsOut, tzOut] = process.argv.slice(2);
if (!citiesPath || !adminPath || !townsOut || !tzOut) {
  console.error('usage: build-places.mjs <cities15000.txt> <admin1CodesASCII.txt> <towns.json> <tzCountry.json>');
  process.exit(2);
}

const admins = new Map();
for (const line of readFileSync(adminPath, 'utf8').split('\n')) {
  const [code, name] = line.split('\t');
  if (code && name) admins.set(code, name);
}

const towns = [];
const zones = new Map();
for (const line of readFileSync(citiesPath, 'utf8').split('\n')) {
  const c = line.split('\t');
  if (c.length < 18) continue;
  const name = c[1].trim();
  const cc = c[8].trim().toUpperCase();
  const lat = Number(c[4]);
  const lng = Number(c[5]);
  const pop = Number(c[14]) || 0;
  if (!name || !/^[A-Z]{2}$/.test(cc) || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
  const admin = admins.get(`${cc}.${c[10]}`) ?? '';
  towns.push([name, admin, cc, Math.round(lat * 1000) / 1000, Math.round(lng * 1000) / 1000, pop]);
  const tz = c[17].trim();
  if (tz) {
    const byCountry = zones.get(tz) ?? new Map();
    byCountry.set(cc, (byCountry.get(cc) ?? 0) + 1);
    zones.set(tz, byCountry);
  }
}

towns.sort((a, b) => (a[2] === b[2] ? b[5] - a[5] : a[2] < b[2] ? -1 : 1));
const tzCountry = {};
for (const [tz, byCountry] of [...zones].sort(([a], [b]) => (a < b ? -1 : 1))) {
  tzCountry[tz] = [...byCountry].sort((a, b) => b[1] - a[1])[0][0];
}

for (const out of [townsOut, tzOut]) mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(townsOut, `[\n${towns.map((t) => JSON.stringify(t)).join(',\n')}\n]\n`);
writeFileSync(tzOut, `${JSON.stringify(tzCountry, null, 0)}\n`);
console.log(`towns ${towns.length}, zones ${Object.keys(tzCountry).length}, Lagos ${JSON.stringify(towns.find((t) => t[0] === 'Lagos' && t[2] === 'NG'))}, Africa/Lagos ${tzCountry['Africa/Lagos']}`);
