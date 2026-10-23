// Public-domain Natural Earth geometry; the beta map makes no tile-provider requests.
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const source =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';
const response = await fetch(source, { signal: AbortSignal.timeout(30000) });
if (!response.ok) throw Error('WORLD_GEOMETRY_UNAVAILABLE');
const raw = await response.text(),
  input = JSON.parse(raw);
const round = (value) =>
  typeof value === 'number' ? Math.round(value * 1000) / 1000 : Array.isArray(value) ? value.map(round) : value;
const data = {
  type: 'FeatureCollection',
  features: input.features.map((feature) => ({
    type: 'Feature',
    properties: { name: feature.properties.NAME_FR || feature.properties.NAME },
    geometry: { type: feature.geometry.type, coordinates: round(feature.geometry.coordinates) },
  })),
};
await mkdir('apps/web/public/maps', { recursive: true });
await writeFile('apps/web/public/maps/world-110m.geojson', JSON.stringify(data));
await writeFile(
  'apps/web/public/maps/world-110m-source.txt',
  `Natural Earth, 1:110m countries. Public domain.\nSource: ${source}\nSource SHA-256: ${createHash('sha256').update(raw).digest('hex')}\nTerms: https://www.naturalearthdata.com/about/terms-of-use/\nCoordinates rounded to 3 decimals; only names and geometry retained.\n`,
);
console.log(JSON.stringify({ countries: data.features.length, bytes: JSON.stringify(data).length }));
