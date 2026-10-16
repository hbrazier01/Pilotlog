/**
 * Terrarium / AWS Terrain Tile helpers (pure + fetch proxy target).
 * Elevation decode: (R * 256 + G + B / 256) - 32768  (meters)
 * Tiles: https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png
 */
export const TERRAIN_TILE_BASE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';

export function lonLatToTile(lon, lat, z) {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y, z, n };
}

/** Validate tile path params; reject path traversal / absurd zooms. */
export function parseTileParams(z, x, y) {
  const zi = Number(z), xi = Number(x), yi = Number(y);
  if (!Number.isInteger(zi) || zi < 0 || zi > 15) return null;
  const n = 2 ** zi;
  if (!Number.isInteger(xi) || !Number.isInteger(yi) || xi < 0 || yi < 0 || xi >= n || yi >= n) return null;
  return { z: zi, x: xi, y: yi };
}

export function terrariumUrl({ z, x, y }) {
  return `${TERRAIN_TILE_BASE}/${z}/${x}/${y}.png`;
}

/** Decode one Terrarium RGB pixel → elevation meters. */
export function decodeTerrariumRgb(r, g, b) {
  return r * 256 + g + b / 256 - 32768;
}

/** KAPA + Front Range tile window at a given zoom (west-biased). */
export function kapaTileWindow(z = 10) {
  const kapa = lonLatToTile(-104.85, 39.57, z);
  // Look west: include more tiles in -x (west)
  return {
    z,
    x0: kapa.x - 2,
    x1: kapa.x + 1,
    y0: kapa.y - 1,
    y1: kapa.y + 1,
    kapa,
  };
}
