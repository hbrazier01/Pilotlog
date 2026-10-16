/**
 * Photoreal ground imagery via Cesium ion (asset 2 = Bing Maps Aerial, served through ion).
 * The ion token is read server-side from CESIUM_ION_TOKEN and never sent to the browser:
 * the browser asks /api/imagery/{z}/{x}/{y}.jpg and this module resolves the tile.
 * Cesium ion free (Community) tier is for non-commercial / evaluation use.
 */
const ION = 'https://api.cesium.com/v1/assets';
const ASSET = Number(process.env.CESIUM_ION_IMAGERY_ASSET || 2);
let session = null; // { at, template, subdomains, attribution }
const tiles = new Map(); // tiny LRU of recent tiles
const MAX_TILES = 400;

export const imageryEnabled = () => !!process.env.CESIUM_ION_TOKEN;

/** Web-mercator tile → Bing quadkey. */
export function quadKey(z, x, y) {
  let q = '';
  for (let i = z; i > 0; i--) { let d = 0; const m = 1 << (i - 1); if (x & m) d += 1; if (y & m) d += 2; q += d; }
  return q;
}

async function getSession(fetchImpl = fetch) {
  if (session && Date.now() - session.at < 50 * 60e3) return session;
  const token = process.env.CESIUM_ION_TOKEN;
  if (!token) return null;
  const ep = await (await fetchImpl(`${ION}/${ASSET}/endpoint`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) })).json();
  if (ep?.externalType !== 'BING' || !ep.options?.key) throw new Error('ion imagery endpoint unavailable');
  const style = ep.options.mapStyle || 'Aerial';
  const meta = await (await fetchImpl(`${ep.options.url.replace(/\/$/, '')}/REST/v1/Imagery/Metadata/${style}?key=${encodeURIComponent(ep.options.key)}&uriScheme=https`, { signal: AbortSignal.timeout(10000) })).json();
  const r = meta?.resourceSets?.[0]?.resources?.[0];
  if (!r?.imageUrl) throw new Error('imagery metadata unavailable');
  session = { at: Date.now(), template: r.imageUrl, subdomains: r.imageUrlSubdomains || ['t0'], attribution: 'Imagery © Microsoft Bing via Cesium ion' };
  return session;
}

export async function fetchImageryTile({ z, x, y }, fetchImpl = fetch) {
  const k = `${z}/${x}/${y}`;
  if (tiles.has(k)) { const v = tiles.get(k); tiles.delete(k); tiles.set(k, v); return v; }
  const s = await getSession(fetchImpl);
  if (!s) return null;
  const q = quadKey(z, x, y);
  const url = s.template.replace('{subdomain}', s.subdomains[(x + y) % s.subdomains.length]).replace('{quadkey}', q).replace('{culture}', 'en-US');
  const r = await fetchImpl(url, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error('tile ' + r.status);
  const v = { type: r.headers.get('content-type') || 'image/jpeg', buf: Buffer.from(await r.arrayBuffer()) };
  tiles.set(k, v); if (tiles.size > MAX_TILES) tiles.delete(tiles.keys().next().value);
  return v;
}
export const imageryAttribution = () => session?.attribution || 'Imagery © Microsoft Bing via Cesium ion';
