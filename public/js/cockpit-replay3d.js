/**
 * Flight replay 3D — cinematic, keyless.
 * Terrarium elevation (proxied /api/terrain) rendered with a custom shader:
 * elevation color ramp + hillshade + contour lines + dusk atmosphere.
 * Track: thin glowing ribbon with progress trail, altitude curtain + drop lines.
 * Aircraft: low-poly procedural model per the student's aircraft type (Settings), with nav lights.
 * Camera: orbit (frames whole flight) or chase (eased follow).
 */
import * as THREE from '/js/three.module.min.js';
import { buildAircraft } from '/js/aircraft-models.js';

let ORIGIN = { lat: 39.5701, lon: -104.8484, elev: 1791 };
const DEG = Math.PI / 180;
const VERT_EXAG = 2.4;
// Low dusk sun in the west-southwest (scene: x=east, y=up, z=south)
const SUN_DIR = new THREE.Vector3(-0.80, 0.07, 0.60).normalize();
const HAZE = new THREE.Color(0x151a2b);

function lonLatToTile(lon, lat, z) {
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const latRad = lat * DEG;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y, n };
}
function tileXYToLonLat(z, x, y) {
  const n = 2 ** z;
  const lon = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  return { lon, lat: latRad / DEG };
}
const terrariumElev = (r, g, b) => r * 256 + g + b / 256 - 32768;

function toLocal(lon, lat, elevM) {
  const R = 6378137;
  return {
    x: (lon - ORIGIN.lon) * DEG * Math.cos(ORIGIN.lat * DEG) * R,
    y: (elevM - ORIGIN.elev) * VERT_EXAG,
    z: -(lat - ORIGIN.lat) * DEG * R,
  };
}

async function loadHeightmap({ z = 12, mobile = false } = {}) {
  const k = lonLatToTile(ORIGIN.lon, ORIGIN.lat, z);
  const cx = Math.floor(k.x), cy = Math.floor(k.y);
  const tx0 = cx - (mobile ? 5 : 7), tx1 = cx + (mobile ? 4 : 5);
  const ty0 = cy - (mobile ? 4 : 5), ty1 = cy + (mobile ? 4 : 4);
  const step = mobile ? 8 : 4;
  const tw = 256 / step;
  const cols = (tx1 - tx0 + 1) * tw, rows = (ty1 - ty0 + 1) * tw;
  const elev = new Float32Array(cols * rows).fill(NaN);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const jobs = [];
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    jobs.push(fetch(`/api/terrain/${z}/${tx}/${ty}.png`, typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? { signal: AbortSignal.timeout(8000) } : {})
      .then((r) => { if (!r.ok) throw new Error('tile ' + r.status); return r.blob(); })
      .then((b) => createImageBitmap(b))
      .then((bmp) => {
        ctx.clearRect(0, 0, 256, 256); ctx.drawImage(bmp, 0, 0);
        const d = ctx.getImageData(0, 0, 256, 256).data;
        const ox = (tx - tx0) * tw, oy = (ty - ty0) * tw;
        for (let py = 0, ry = 0; py < 256; py += step, ry++)
          for (let px = 0, rx = 0; px < 256; px += step, rx++) {
            const i = (py * 256 + px) * 4;
            elev[(oy + ry) * cols + ox + rx] = terrariumElev(d[i], d[i + 1], d[i + 2]);
          }
      })
      .catch(() => {}));
  }
  await Promise.all(jobs);
  let fill = ORIGIN.elev;
  for (let i = 0; i < elev.length; i++) if (Number.isNaN(elev[i])) elev[i] = fill; else fill = elev[i];
  return { elev, cols, rows, tx0, ty0, z, step, tw };
}

/** Bilinear ground elevation (meters MSL) at lon/lat. */
function groundAt(hm, lon, lat) {
  const k = lonLatToTile(lon, lat, hm.z);
  const gx = (k.x - hm.tx0) * hm.tw, gy = (k.y - hm.ty0) * hm.tw;
  const x0 = Math.max(0, Math.min(hm.cols - 2, Math.floor(gx)));
  const y0 = Math.max(0, Math.min(hm.rows - 2, Math.floor(gy)));
  const fx = Math.min(1, Math.max(0, gx - x0)), fy = Math.min(1, Math.max(0, gy - y0));
  const e = (x, y) => hm.elev[y * hm.cols + x];
  return (e(x0, y0) * (1 - fx) + e(x0 + 1, y0) * fx) * (1 - fy) + (e(x0, y0 + 1) * (1 - fx) + e(x0 + 1, y0 + 1) * fx) * fy;
}

/**
 * Photoreal imagery atlases (Cesium ion → Bing Aerial, proxied by /api/imagery so the token stays
 * server-side). base: whole terrain extent at the heightmap zoom+1; detail: the flight area at z15.
 */
async function loadImagery(hm, { mobile = false, bbox = null } = {}) {
  try {
    const st = await (await fetch('/api/imagery/status')).json();
    if (!st?.enabled) return null;
    const atlas = async (z, tx0, ty0, nx, ny) => {
      const cv = document.createElement('canvas'); cv.width = nx * 256; cv.height = ny * 256;
      const c2 = cv.getContext('2d'); c2.fillStyle = '#3a3a30'; c2.fillRect(0, 0, cv.width, cv.height);
      let ok = 0; const queue = [];
      for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) queue.push([x, y]);
      const total = queue.length;
      const one = async ([x, y]) => {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const r = await fetch(`/api/imagery/${z}/${tx0 + x}/${ty0 + y}.jpg`);
            if (!r.ok) throw new Error(String(r.status));
            const bmp = await createImageBitmap(await r.blob());
            c2.drawImage(bmp, x * 256, y * 256); ok++; return;
          } catch { await new Promise((res) => setTimeout(res, 300 * (attempt + 1))); }
        }
      };
      // bounded concurrency so we don't hammer the proxy/upstream
      await Promise.all(Array.from({ length: 8 }, async () => { while (queue.length) await one(queue.shift()); }));
      if (ok < total * 0.5) return null;
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
      return { tex, z, tx0, ty0, nx, ny };
    };
    // three levels: far (heightmap zoom, whole extent), mid (flight area + margin), detail (flight area)
    const base = await atlas(hm.z, hm.tx0, hm.ty0, Math.round(hm.cols / hm.tw), Math.round(hm.rows / hm.tw));
    if (!base) return null;
    const region = async (zd, pad, cap) => {
      if (!bbox) return null;
      const a = lonLatToTile(bbox.w - pad, bbox.n + pad, zd), b = lonLatToTile(bbox.e + pad, bbox.s - pad, zd);
      let x0 = Math.floor(a.x), y0 = Math.floor(a.y), nx = Math.floor(b.x) - x0 + 1, ny = Math.floor(b.y) - y0 + 1;
      if (nx > cap) { x0 += Math.floor((nx - cap) / 2); nx = cap; }
      if (ny > cap) { y0 += Math.floor((ny - cap) / 2); ny = cap; }
      return atlas(zd, x0, y0, nx, ny);
    };
    const mid = await region(mobile ? 13 : 14, 0.07, mobile ? 10 : 16);
    const detail = await region(15, 0.012, mobile ? 10 : 20);
    return { base, mid, detail, attribution: st.attribution };
  } catch { return null; }
}
function atlasUv(img, lon, lat) {
  if (!img) return [-1, -1];
  const k = lonLatToTile(lon, lat, img.z);
  return [(k.x - img.tx0) / img.nx, 1 - (k.y - img.ty0) / img.ny];
}

const TERRAIN_VS = `
attribute float aElev; attribute vec2 aUvB; attribute vec2 aUvD; attribute vec2 aUvM;
varying float vElev; varying vec3 vN; varying vec3 vW; varying float vDist; varying vec2 vUvB; varying vec2 vUvD; varying vec2 vUvM;
void main(){
  vElev = aElev; vUvB = aUvB; vUvD = aUvD; vUvM = aUvM; vN = normalize(normal);
  vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz;
  vec4 mv = viewMatrix * w; vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const TERRAIN_FS = `
uniform vec3 uSun; uniform vec3 uHaze; uniform vec3 uSunCol; uniform float uFog; uniform float uField;
uniform float uPhoto; uniform float uHasD; uniform float uHasM; uniform sampler2D uImgB; uniform sampler2D uImgD; uniform sampler2D uImgM;
varying float vElev; varying vec3 vN; varying vec3 vW; varying float vDist; varying vec2 vUvB; varying vec2 vUvD; varying vec2 vUvM;
float inside(vec2 uv, float soft){ float e = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)); return smoothstep(0.0, soft, e); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
void main(){
  float e = vElev;
  float rel = e - uField;
  // elevation ramp: dry high-plains → foothill scrub → forest → rock → snow
  vec3 plains = vec3(0.15,0.135,0.10);
  vec3 scrub  = vec3(0.17,0.19,0.12);
  vec3 forest = vec3(0.07,0.12,0.08);
  vec3 rock   = vec3(0.33,0.30,0.29);
  vec3 snow   = vec3(0.92,0.93,0.97);
  vec3 c = mix(plains, scrub, smoothstep(150.0, 450.0, rel));
  c = mix(c, forest, smoothstep(450.0, 900.0, rel));
  c = mix(c, rock, smoothstep(1500.0, 2000.0, rel));
  c = mix(c, snow, smoothstep(3500.0, 3800.0, e) * smoothstep(0.55, 0.85, vN.y));
  // field / suburb mosaic on plains
  float n = noise(vW.xz / 900.0) * 0.6 + noise(vW.xz / 180.0) * 0.4;
  float parcels = hash(floor(vW.xz / 420.0));
  float flat_ = 1.0 - smoothstep(250.0, 600.0, rel);
  c *= mix(1.0, 0.72 + 0.55 * n + 0.18 * (parcels - 0.5), flat_);
  // hillshade (low sun) + sky fill
  float ndl = max(dot(normalize(vN), uSun), 0.0);
  float shade = 0.16 + 1.05 * ndl;
  vec3 col = c * shade * mix(vec3(0.55,0.62,0.85), uSunCol, ndl);
  // contour lines every 100 m, index every 500 m
  float fw = max(fwidth(e), 0.001);
  float l1 = 1.0 - smoothstep(0.0, 1.2, abs(fract(e/100.0 - 0.5) - 0.5) * 100.0 / fw);
  float l5 = 1.0 - smoothstep(0.0, 1.6, abs(fract(e/500.0 - 0.5) - 0.5) * 500.0 / fw);
  float cfade = 1.0 - smoothstep(9000.0, 26000.0, vDist);
  col += vec3(0.13,0.55,0.62) * (l1 * 0.10 + l5 * 0.28) * cfade;
  // sparse warm city lights on flat ground near field
  vec2 cell = floor(vW.xz / 45.0);
  float lit = step(0.992, hash(cell)) * flat_ * (1.0 - smoothstep(4000.0, 22000.0, length(vW.xz)));
  float dens = smoothstep(0.35, 0.75, noise(vW.xz / 2600.0));
  col += vec3(1.0,0.66,0.30) * lit * dens * 0.7;
  // atmosphere: distance haze + sun-side warm scatter
  float fogF = 1.0 - exp(-pow(vDist * uFog, 1.35));
  vec3 view = normalize(vW - cameraPosition);
  float sunScat = pow(max(dot(view, uSun), 0.0), 6.0);
  vec3 haze = mix(uHaze, vec3(0.45,0.24,0.16), sunScat * 0.5);
  col = mix(col, haze, clamp(fogF, 0.0, 1.0));
  if (uPhoto > 0.5) {
    // satellite imagery (sRGB texture → linear by three), detail atlas where available, soft-edged
    vec3 img = texture2D(uImgB, vUvB).rgb;
    img = mix(img, texture2D(uImgM, vUvM).rgb, uHasM * inside(vUvM, 0.15));
    img = mix(img, texture2D(uImgD, vUvD).rgb, uHasD * inside(vUvD, 0.15));
    float ndl2 = max(dot(normalize(vN), uSun), 0.0);
    // cinematic grade: contrast S-curve, saturation, dusk split-tone (cool shadows, warm highlights)
    float lum = dot(img, vec3(0.2126,0.7152,0.0722));
    img = mix(vec3(lum), img, 1.28);
    img = clamp((img - 0.045) * 1.32, 0.0, 1.0);
    img = img * img * (3.0 - 2.0 * img) * 0.55 + img * 0.45;
    float l2 = dot(img, vec3(0.2126,0.7152,0.0722));
    img *= mix(vec3(0.70,0.78,1.0), vec3(1.06,0.94,0.82), smoothstep(0.05, 0.5, l2));
    vec3 pc = img * (0.52 + 0.5 * ndl2) * mix(vec3(1.0), uSunCol, 0.35 * ndl2);
    // atmospheric perspective: cool blue-violet haze, warm toward the sun, thicker with distance
    float fogP = 1.0 - exp(-pow(vDist * uFog * 0.75, 2.2));
    vec3 hz = mix(vec3(0.20,0.16,0.26), vec3(0.85,0.40,0.16), pow(sunScat, 1.5) * 0.9);
    pc = mix(pc, hz, clamp(fogP, 0.0, 0.97));
    col = pc;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

function buildTerrainMesh(hm, imagery = null) {
  const { elev, cols, rows } = hm;
  const pos = new Float32Array(cols * rows * 3), ae = new Float32Array(cols * rows);
  const uvB = new Float32Array(cols * rows * 2), uvD = new Float32Array(cols * rows * 2), uvM = new Float32Array(cols * rows * 2);
  for (let iy = 0; iy < rows; iy++) for (let ix = 0; ix < cols; ix++) {
    const i = iy * cols + ix;
    const ll = tileXYToLonLat(hm.z, hm.tx0 + ix / hm.tw, hm.ty0 + iy / hm.tw);
    const p = toLocal(ll.lon, ll.lat, elev[i]);
    pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; ae[i] = elev[i];
    const b = atlasUv(imagery?.base, ll.lon, ll.lat), d = atlasUv(imagery?.detail, ll.lon, ll.lat);
    uvB[i * 2] = b[0]; uvB[i * 2 + 1] = b[1]; uvD[i * 2] = d[0]; uvD[i * 2 + 1] = d[1];
    const m = atlasUv(imagery?.mid, ll.lon, ll.lat); uvM[i * 2] = m[0]; uvM[i * 2 + 1] = m[1];
  }
  const idx = new Uint32Array((cols - 1) * (rows - 1) * 6);
  let k = 0;
  for (let iy = 0; iy < rows - 1; iy++) for (let ix = 0; ix < cols - 1; ix++) {
    const a = iy * cols + ix, b = a + 1, c = a + cols, d = c + 1;
    idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aElev', new THREE.BufferAttribute(ae, 1));
  geo.setAttribute('aUvB', new THREE.BufferAttribute(uvB, 2));
  geo.setAttribute('aUvD', new THREE.BufferAttribute(uvD, 2));
  geo.setAttribute('aUvM', new THREE.BufferAttribute(uvM, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  // un-exaggerate normals a bit so hillshade isn't blown out
  const mat = new THREE.ShaderMaterial({
    vertexShader: TERRAIN_VS, fragmentShader: TERRAIN_FS,
    uniforms: {
      uSun: { value: SUN_DIR }, uHaze: { value: HAZE }, uSunCol: { value: new THREE.Color(1.0, 0.78, 0.55) },
      uFog: { value: 1 / 42000 }, uField: { value: ORIGIN.elev },
      uPhoto: { value: imagery ? 1 : 0 }, uHasD: { value: imagery?.detail ? 1 : 0 },
      uImgB: { value: imagery?.base?.tex || null }, uImgD: { value: imagery?.detail?.tex || imagery?.base?.tex || null },
      uHasM: { value: imagery?.mid ? 1 : 0 }, uImgM: { value: imagery?.mid?.tex || imagery?.base?.tex || null },
    },
  });
  mat.extensions = { derivatives: true };
  return new THREE.Mesh(geo, mat);
}

/** Flat horizon skirt beyond the terrain tiles, shaded like the sky's horizon band so the edge disappears. */
function makeSkirt(y) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: SUN_DIR } }, depthWrite: true,
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform vec3 uSun; varying vec3 vW;
      void main(){ vec3 d = normalize(vW - cameraPosition); float s = max(dot(normalize(vec3(d.x,0.0,d.z)), normalize(vec3(uSun.x,0.0,uSun.z))), 0.0);
        vec3 col = mix(vec3(0.20,0.16,0.26), vec3(0.85,0.40,0.16), pow(s, 9.0) * 0.9);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.RingGeometry(1000, 400000, 64, 1), mat);
  m.rotation.x = -Math.PI / 2; m.position.y = y; m.renderOrder = -5;
  return m;
}

function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uSun: { value: SUN_DIR }, uHaze: { value: HAZE } },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 uSun; uniform vec3 uHaze; varying vec3 vD;
      void main(){
        vec3 d = normalize(vD); float h = d.y;
        float s = max(dot(d, uSun), 0.0);
        vec3 zenith = vec3(0.020,0.035,0.085);
        vec3 upper  = vec3(0.05,0.08,0.18);
        vec3 band   = mix(vec3(0.20,0.16,0.26), vec3(0.85,0.40,0.16), pow(s, 9.0));
        vec3 col = mix(band, upper, smoothstep(0.0, 0.12, h));
        col = mix(col, zenith, smoothstep(0.14, 0.7, h));
        col = mix(col, uHaze, smoothstep(0.0, -0.08, h));
        col += vec3(1.0,0.55,0.25) * pow(s, 10.0) * 0.22 * (1.0 - smoothstep(0.0, 0.35, h));
        col += vec3(1.0,0.85,0.6) * pow(s, 600.0) * 1.2;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
  m.frustumCulled = false; m.renderOrder = -10;
  return m;
}

let _glow;
function glowTex() {
  if (_glow) return _glow;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  _glow = new THREE.CanvasTexture(c);
  return _glow;
}

function ringTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'); x.strokeStyle = '#fff'; x.lineWidth = 7;
  x.setLineDash([22, 12]); x.beginPath(); x.arc(64, 64, 52, 0, Math.PI * 2); x.stroke();
  x.setLineDash([]); x.lineWidth = 3; x.beginPath(); x.arc(64, 64, 38, 0, Math.PI * 2); x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function labelSprite(text, sub, color) {
  const c = document.createElement('canvas');
  const W = 360, H = 96; c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.shadowColor = 'rgba(0,0,0,0.85)'; x.shadowBlur = 0; x.fillStyle = 'rgba(3,6,14,0.92)';
  x.strokeStyle = color; x.lineWidth = 3;
  const r = 18;
  x.beginPath(); x.roundRect ? x.roundRect(4, 4, W - 8, H - 8, r) : x.rect(4, 4, W - 8, H - 8); x.fill(); x.stroke();
  x.fillStyle = color; x.font = '700 32px ui-monospace, Menlo, monospace'; x.textBaseline = 'middle';
  x.fillText(text.toUpperCase(), 22, 36);
  x.fillStyle = '#c9d4e6'; x.font = '500 24px ui-monospace, Menlo, monospace';
  x.fillText(sub, 22, 70);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
  sp.center.set(0.5, -0.15);
  sp.userData.aspect = W / H;
  sp.renderOrder = 20;
  return sp;
}

const RIBBON_VS = `attribute float aU; varying float vU; void main(){ vU = aU; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const RIBBON_FS = `uniform float uProg; uniform vec3 uCol; uniform float uAlpha; varying float vU;
  void main(){
    float flown = step(vU, uProg);
    float trail = smoothstep(uProg - 0.35, uProg, vU);           // brighter near aircraft
    float aFlown = mix(0.45, 1.0, trail);
    float aAhead = 0.16 + 0.22 * step(0.5, fract(vU * 90.0));          // dashed future path
    float a = mix(aAhead, aFlown, flown) * uAlpha;
    vec3 c = mix(uCol * 0.8, mix(uCol, vec3(0.85,1.0,1.0), trail * 0.6), flown);
    gl_FragColor = vec4(c, a);
  }`;

function ribbonMat(col, alpha, prog) {
  return new THREE.ShaderMaterial({
    vertexShader: RIBBON_VS, fragmentShader: RIBBON_FS, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uProg: prog, uCol: { value: new THREE.Color(col) }, uAlpha: { value: alpha } },
  });
}
function tubeWithU(curve, segs, radius, radial) {
  const geo = new THREE.TubeGeometry(curve, segs, radius, radial, false);
  const n = geo.attributes.position.count, u = new Float32Array(n);
  for (let i = 0; i <= segs; i++) for (let j = 0; j <= radial; j++) u[i * (radial + 1) + j] = i / segs;
  geo.setAttribute('aU', new THREE.BufferAttribute(u, 1));
  return geo;
}

/** Vertical gradient curtain from track down to ground + periodic drop lines. */
function makeCurtain(samples, prog) {
  const n = samples.length;
  const pos = new Float32Array(n * 2 * 3), uu = new Float32Array(n * 2), vv = new Float32Array(n * 2);
  samples.forEach((s, i) => {
    pos.set([s.p.x, s.p.y, s.p.z], i * 6); pos.set([s.p.x, s.g, s.p.z], i * 6 + 3);
    uu[i * 2] = uu[i * 2 + 1] = s.u; vv[i * 2] = 1; vv[i * 2 + 1] = 0;
  });
  const idx = [];
  for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aU', new THREE.BufferAttribute(uu, 1));
  geo.setAttribute('aV', new THREE.BufferAttribute(vv, 1));
  geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uProg: prog },
    vertexShader: `attribute float aU; attribute float aV; varying float vU; varying float vV;
      void main(){ vU=aU; vV=aV; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform float uProg; varying float vU; varying float vV;
      void main(){ float flown = step(vU, uProg);
        float a = pow(vV, 1.3) * mix(0.025, 0.22, flown);
        gl_FragColor = vec4(0.13,0.83,0.93, a); }`,
  });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, mat));
  const lp = [];
  for (let i = 0; i < n; i += 30) { const s = samples[i]; lp.push(s.p.x, s.p.y, s.p.z, s.p.x, s.g, s.p.z); }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending })));
  // ground shadow trace
  const sp = samples.map((s) => new THREE.Vector3(s.p.x, s.g + 4, s.p.z));
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(sp), new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.45, depthWrite: false })));
  return g;
}

const EVENT_COLORS = { steep_turn: '#f472d0', slow_flight: '#fbbf24', bounced_landing: '#fb7185', touch_and_go: '#34f5a0', full_stop: '#22d3ee' };
// Merge events that would stack on the same spot: back-to-back steep turns, bounce + full stop.
export function clusterEvents(events, t0) {
  const out = [];
  for (const e of events || []) {
    const prev = out[out.length - 1];
    if (prev && prev.type === 'steep_turn' && e.type === 'steep_turn' && e.t - prev.lastT < 120000) { prev.count++; prev.lastT = e.t; prev.label = `Steep turns ×${prev.count}`; continue; }
    if (prev && prev.type === 'bounced_landing' && e.type === 'full_stop' && e.t - prev.lastT < 60000) { prev.lastT = e.t; continue; }
    out.push({ ...e, count: 1, lastT: e.t });
  }
  return out;
}

function makeEventPin(pos, ground, label, sub, color) {
  const g = new THREE.Group();
  const col = new THREE.Color(color);
  const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(pos.x, ground, pos.z), pos.clone()]);
  g.add(new THREE.Line(lg, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })));
  const ring = new THREE.Mesh(new THREE.RingGeometry(40, 60, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(pos.x, ground + 6, pos.z); g.add(ring);
  const orb = new THREE.Mesh(new THREE.SphereGeometry(18, 16, 12), new THREE.MeshBasicMaterial({ color: col }));
  orb.position.copy(pos); g.add(orb);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(220); halo.position.copy(pos); g.add(halo);
  const lab = labelSprite(label, sub, color);
  lab.position.copy(pos); g.add(lab);
  g.userData = { ring, halo, lab };
  return g;
}

function makeAirportPad(ground, hdgDeg) {
  const g = new THREE.Group();
  const rw = new THREE.Mesh(new THREE.PlaneGeometry(45, 2900), new THREE.MeshBasicMaterial({ color: 0x1b2230 }));
  rw.rotation.x = -Math.PI / 2; g.add(rw);
  const pts = [];
  for (let s of [-1, 1]) for (let y = -1450; y <= 1450; y += 120) pts.push(new THREE.Vector3(s * 26, 3, y));
  const lights = new THREE.Points(new THREE.BufferGeometry().setFromPoints(pts), new THREE.PointsMaterial({ color: 0xffe2a8, size: 3, sizeAttenuation: false, transparent: true, opacity: 0.95 }));
  g.add(lights);
  const ctr = [];
  for (let y = -1300; y <= 1300; y += 90) ctr.push(new THREE.Vector3(0, 2, y), new THREE.Vector3(0, 2, y + 45));
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ctr), new THREE.LineBasicMaterial({ color: 0xcfd8e6, transparent: true, opacity: 0.6 })));
  g.position.y = ground + 3;
  g.rotation.y = -hdgDeg * DEG; // runway long axis is local Z (south); heading 0 = north = -Z
  return g;
}

function bearing(a, b) {
  const y = Math.sin((b.lon - a.lon) * DEG) * Math.cos(b.lat * DEG);
  const x = Math.cos(a.lat * DEG) * Math.sin(b.lat * DEG) - Math.sin(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.cos((b.lon - a.lon) * DEG);
  return (Math.atan2(y, x) / DEG + 360) % 360;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ points: any[], events?: any[] }} track
 */
export function mountReplay3d(canvas, track) {
  {
    const o = track?.origin;
    const p0 = (track?.points || [])[0];
    const fe = Number(track?.fieldElevFt);
    if (o && Number.isFinite(o.lat)) ORIGIN = { lat: o.lat, lon: o.lon, elev: Number(o.elev) || 0 };
    else if (p0) ORIGIN = { lat: p0.lat, lon: p0.lon, elev: Number.isFinite(fe) ? fe / 3.28084 : (Number(p0.altFt) || 0) / 3.28084 };
  }
  let disposed = false, raf = 0, visible = true;
  let renderer, scene, camera, aircraft, curve, composer = null, photo = null;
  let playing = true, speed = 1, u = 0, view = 'orbit';
  const prog = { value: 0 };
  const clock = new THREE.Clock();
  const mobile = window.matchMedia('(max-width: 720px)').matches || (navigator.maxTouchPoints || 0) > 0;
  const points = track.points || [];
  const t0 = points[0]?.t || 0;
  const t1 = points[points.length - 1]?.t || 1;
  const listeners = { time: [], hud: [] };
  // time → curve param (curve control points are the track points)
  const times = points.map((p) => p.t);
  const uToParam = (uu) => {
    const t = t0 + uu * (t1 - t0);
    let lo = 0, hi = times.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (times[m] <= t) lo = m; else hi = m; }
    const f = times[hi] > times[lo] ? (t - times[lo]) / (times[hi] - times[lo]) : 0;
    return { param: (lo + Math.min(1, Math.max(0, f))) / Math.max(1, points.length - 1), idx: f > 0.5 ? hi : lo };
  };

  const ready = (async () => {
    if (!points.length) throw new Error('empty track');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.75));
    renderer.setClearColor(0x05070f, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    scene = new THREE.Scene();
    const sky = makeSky();
    scene.add(sky);
    scene.add(new THREE.HemisphereLight(0x9fb4e0, 0x1a1410, 0.9));
    const sun = new THREE.DirectionalLight(0xffc690, 2.2);
    sun.position.copy(SUN_DIR).multiplyScalar(10000); scene.add(sun);
    const rim = new THREE.DirectionalLight(0x6fd8ff, 0.8); rim.position.set(3000, 2000, -2000); scene.add(rim);

    const hm = await loadHeightmap({ z: 12, mobile });
    if (disposed) return;
    let bbox = null;
    for (const p of points) { if (!bbox) bbox = { w: p.lon, e: p.lon, n: p.lat, s: p.lat }; bbox.w = Math.min(bbox.w, p.lon); bbox.e = Math.max(bbox.e, p.lon); bbox.n = Math.max(bbox.n, p.lat); bbox.s = Math.min(bbox.s, p.lat); }
    
    const imagery = new URLSearchParams(location.search).get('photo') === '0' ? null : await loadImagery(hm, { mobile, bbox });
    if (disposed) return;
    photo = imagery ? { attribution: imagery.attribution } : null;
    const terrain = buildTerrainMesh(hm, imagery);
    scene.add(terrain);
    { let mn = Infinity; for (const e of hm.elev) if (e < mn) mn = e; scene.add(makeSkirt(toLocal(ORIGIN.lon, ORIGIN.lat, mn).y - 60)); }

    // track samples with ground under each point
    const vecs = points.map((p) => {
      const q = toLocal(p.lon, p.lat, (Number(p.altFt) || ORIGIN.elev * 3.28084) / 3.28084);
      const gy = toLocal(p.lon, p.lat, groundAt(hm, p.lon, p.lat)).y;
      return new THREE.Vector3(q.x, Math.max(q.y, gy + 12), q.z);
    });
    curve = new THREE.CatmullRomCurve3(vecs, false, 'centripetal');
    const N = Math.min(1200, Math.max(200, points.length * 3));
    const samples = [];
    for (let i = 0; i <= N; i++) {
      const pu = i / N;
      const p = curve.getPoint(pu);
      const fi = pu * (points.length - 1), i0 = Math.floor(fi), i1 = Math.min(points.length - 1, i0 + 1), f = fi - i0;
      const lat = points[i0].lat * (1 - f) + points[i1].lat * f, lon = points[i0].lon * (1 - f) + points[i1].lon * f;
      samples.push({ p, u: pu, g: toLocal(lon, lat, groundAt(hm, lon, lat)).y });
    }

    // ribbon: thin hot core + soft glow
    const ribbon = new THREE.Group();
    ribbon.add(new THREE.Mesh(tubeWithU(curve, N, mobile ? 30 : 24, 8), ribbonMat(0x9ff8ff, 1.0, prog)));
    const glowTube = new THREE.Mesh(tubeWithU(curve, Math.round(N / 2), mobile ? 95 : 80, 10), ribbonMat(0x22d3ee, 0.32, prog));
    ribbon.add(glowTube);
    const chaseTube = new THREE.Mesh(tubeWithU(curve, N, 1.4, 5), ribbonMat(0x7ff3ff, 0.55, prog));
    ribbon.add(chaseTube);
    const coreTube = ribbon.children[0];
    scene.add(ribbon);
    const curtain = makeCurtain(samples, prog); scene.add(curtain);

    // airport runway if the track starts on the ground
    const p0 = points[0];
    const fieldFt = ORIGIN.elev * 3.28084;
    if (Math.abs((Number(p0.altFt) || fieldFt) - fieldFt) < 120) {
      const roll = points.slice(0, 40).find((p) => (Number(p.altFt) || 0) > fieldFt + 150) || points[Math.min(points.length - 1, 15)];
      const hdg = Number.isFinite(p0.hdgDeg) ? p0.hdgDeg : bearing(p0, roll);
      const pad = makeAirportPad(toLocal(p0.lon, p0.lat, groundAt(hm, p0.lon, p0.lat)).y, hdg);
      const a = toLocal(p0.lon, p0.lat, 0);
      // center runway ~1.3 km along heading from the start point
      pad.position.x = a.x + Math.sin(hdg * DEG) * 1300;
      pad.position.z = a.z - Math.cos(hdg * DEG) * 1300;
      scene.add(pad);
    }

    // events as glowing labeled pins
    const pins = [];
    for (const e of clusterEvents(track.events, t0)) {
      const i = Number.isInteger(e.index) ? e.index : uToParam((e.t - t0) / Math.max(1, t1 - t0)).idx;
      const p = points[Math.max(0, Math.min(points.length - 1, i))];
      const pos = vecs[Math.max(0, Math.min(vecs.length - 1, i))].clone();
      const gy = toLocal(p.lon, p.lat, groundAt(hm, p.lon, p.lat)).y;
      const s = Math.round((e.t - t0) / 1000);
      const sub = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` + (e.meta?.bankDeg ? ` · ${e.meta.bankDeg}° bank` : e.meta?.gsKt ? ` · ${e.meta.gsKt} kt` : '');
      const pin = makeEventPin(pos, gy, e.label || e.type, sub, EVENT_COLORS[e.type] || '#f472d0');
      pin.userData.u = (e.t - t0) / Math.max(1, t1 - t0);
      scene.add(pin); pins.push(pin);
    }

    const qType = new URLSearchParams(location.search).get('aircraft');
    aircraft = buildAircraft(qType || track.aircraftType || 'other');
    const acScale = mobile ? 120 : 115; // orbit: big + glowing so it reads at full-flight zoom
    aircraft.scale.setScalar(acScale);
    scene.add(aircraft);
    const acGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0x22d3ee, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    acGlow.scale.setScalar(acScale * 16); scene.add(acGlow);
    // screen-space locator ring: constant on-screen size so the aircraft is findable at any zoom
    const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex(), color: 0x7ff3ff, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
    marker.scale.setScalar(mobile ? 0.11 : 0.09); marker.renderOrder = 30; scene.add(marker);

    // framing
    const box = new THREE.Box3().setFromPoints(vecs);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const extent = Math.max(size.x, size.z, 1500);

    camera = new THREE.PerspectiveCamera(mobile ? 50 : 40, 1, 10, 200000);
    sky.scale.setScalar(150000);

    if (!mobile) {
      try {
        const { EffectComposer } = await import('/js/pp/EffectComposer.js');
        const { RenderPass } = await import('/js/pp/RenderPass.js');
        const { UnrealBloomPass } = await import('/js/pp/UnrealBloomPass.js');
        const { OutputPass } = await import('/js/pp/OutputPass.js');
        composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));
        composer.addPass(new UnrealBloomPass(new THREE.Vector2(512, 512), 0.6, 0.45, 0.82));
        composer.addPass(new OutputPass());
      } catch { composer = null; }
    }

    let aspect = 1;
    function resize() {
      const w = canvas.clientWidth || 640, h = canvas.clientHeight || 420;
      renderer.setSize(w, h, false);
      aspect = w / Math.max(1, h);
      camera.aspect = aspect; camera.updateProjectionMatrix();
      if (composer) { composer.setSize(w, h); composer.setPixelRatio(renderer.getPixelRatio()); }
    }
    resize();
    window.addEventListener('resize', resize);
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => resize()).observe(canvas);
    const io = new IntersectionObserver((en) => { visible = en.some((e) => e.isIntersecting); }, { threshold: 0.05 });
    io.observe(canvas);

    // camera rig state
    const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
    let orbitD = 0, camInit = false, orbitT = 0, prevHdg = null, bank = 0;
    const up = new THREE.Vector3(0, 1, 0);
    // Orbit: look from the east toward the sunset/mountains (sun is west)
    const baseAz = Math.atan2(-SUN_DIR.z, -SUN_DIR.x); // direction opposite sun on XZ
    const corners = [];
    for (let i = 0; i < vecs.length; i += 4) corners.push(vecs[i]);
    // Portrait screens: look down the track's long axis so the whole flight fits the tall frame
    let axisAz = baseAz;
    {
      let sxx = 0, szz = 0, sxz = 0;
      for (const c of corners) { const dx = c.x - center.x, dz = c.z - center.z; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; }
      const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz);
      const opts = [ang, ang + Math.PI];
      axisAz = opts.reduce((b, a) => (Math.abs(Math.atan2(Math.sin(a - baseAz), Math.cos(a - baseAz))) < Math.abs(Math.atan2(Math.sin(b - baseAz), Math.cos(b - baseAz))) ? a : b));
    }
    // Fit-to-frame: iteratively project the point set and solve for look + distance so the
    // whole bounding set lands inside the viewport (both FOV axes), with padding for labels/UI.
    const fitCam = new THREE.PerspectiveCamera();
    const _v = new THREE.Vector3();
    function fitView(pts, az, el, pad) {
      fitCam.fov = camera.fov; fitCam.aspect = aspect; fitCam.near = 10; fitCam.far = 400000; fitCam.updateProjectionMatrix();
      const d = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
      const f = d.clone().negate();
      const r = new THREE.Vector3().crossVectors(f, up).normalize();
      const uu = new THREE.Vector3().crossVectors(r, f).normalize();
      const bb = new THREE.Box3().setFromPoints(pts);
      const look = bb.getCenter(new THREE.Vector3());
      const tanY = Math.tan((camera.fov * DEG) / 2), tanX = tanY * aspect;
      let D = 400;
      for (const c of pts) { const v = c.clone().sub(look); const vf = v.dot(f); D = Math.max(D, Math.abs(v.dot(r)) / tanX - vf, Math.abs(v.dot(uu)) / tanY - vf); }
      const availX = 2 - pad.l - pad.r, availY = 2 - pad.t - pad.b;
      const cx = (pad.l - pad.r) / 2, cy = (pad.b - pad.t) / 2; // desired NDC centre of content
      for (let it = 0; it < 48; it++) {
        fitCam.position.copy(look).addScaledVector(d, D); fitCam.lookAt(look); fitCam.updateMatrixWorld();
        let x0 = 9, x1 = -9, y0 = 9, y1 = -9, behind = false;
        for (const c of pts) { _v.copy(c).project(fitCam); if (_v.z > 1 || _v.z < -1) { behind = true; break; } x0 = Math.min(x0, _v.x); x1 = Math.max(x1, _v.x); y0 = Math.min(y0, _v.y); y1 = Math.max(y1, _v.y); }
        if (behind) { D *= 1.5; continue; } // low oblique: some points behind/near the camera — back off, don't shift
        const k = Math.max((x1 - x0) / availX, (y1 - y0) / availY, 0.05);
        // shift look so content centre sits at desired centre, then scale distance
        // damped update: low oblique views are strongly non-linear, full steps oscillate
        look.addScaledVector(r, (((x0 + x1) / 2) - cx) * D * tanX * 0.6).addScaledVector(uu, (((y0 + y1) / 2) - cy) * D * tanY * 0.6);
        D = Math.min(300000, Math.max(300, D * Math.pow(k, 0.7)));
        if (Math.abs(k - 1) < 0.01 && Math.abs((x0 + x1) / 2 - cx) < 0.01 && Math.abs((y0 + y1) / 2 - cy) < 0.01) break;
      }
      if (!Number.isFinite(D) || !Number.isFinite(look.x + look.y + look.z)) { look.copy(bb.getCenter(new THREE.Vector3())); D = Math.max(bb.getSize(_v).length() * 1.6, 2000); }
      return { pos: look.clone().addScaledVector(d, D), look, D };
    }
    const portrait = () => aspect < 0.9;
    function padFor() {
      // top: room for labels that sit above pins; bottom: scrubber overlay (desktop) / compass chip (mobile)
      return portrait() ? { l: 0.06, r: 0.06, t: 0.42, b: 0.24 } : { l: 0.06, r: 0.06, t: 0.62, b: mobile ? 0.3 : 0.3 };
    }
    // Airport-biased set: the ground half of the flight (pattern work) gets duplicated weight
    const fitPts = samplesPts();
    function samplesPts() { const out = []; for (let i = 0; i < vecs.length; i += 2) out.push(vecs[i]); out.push(vecs[vecs.length - 1]); return out; }
    for (const pin of pins) fitPts.push(pin.userData.lab.position);
    let orbitCache = null;
    function orbitTarget() {
      const az0 = portrait() ? axisAz : baseAz;
      const az = az0 + Math.sin(orbitT * 0.05) * 0.12;
      const el = (portrait() ? 28 : 19) * DEG; // portrait: look more top-down so the long track fits the tall frame
      const key = `${aspect.toFixed(3)}|${az.toFixed(3)}`;
      if (!orbitCache || orbitCache.key !== key) orbitCache = { key, ...fitView(fitPts, az, el, padFor()) };
      orbitD = orbitCache.D;
      return orbitCache;
    }
    // Focus: frame the current maneuver (±~2.5 min of track) — makes the pattern / turns legible
    function focusTarget(uu) {
      const tNow = t0 + uu * (t1 - t0), win = 150000;
      const pts = [];
      for (let i = 0; i < points.length; i++) if (Math.abs(points[i].t - tNow) <= win) pts.push(vecs[i]);
      if (pts.length < 3) pts.push(...vecs.slice(0, 3));
      // keep a minimum footprint so slow segments don't zoom absurdly close
      const c = new THREE.Box3().setFromPoints(pts).getCenter(new THREE.Vector3());
      pts.push(c.clone().add(new THREE.Vector3(900, 0, 900)), c.clone().add(new THREE.Vector3(-900, 0, -900)));
      const az = (portrait() ? axisAz : baseAz) + Math.sin(orbitT * 0.05) * 0.12;
      const t = fitView(pts, az, (portrait() ? 55 : 38) * DEG, padFor());
      orbitD = t.D;
      return t;
    }
    function chaseTarget(acPos, tan) {
      const flat = new THREE.Vector3(tan.x, 0, tan.z).normalize();
      const right = new THREE.Vector3().crossVectors(flat, up).normalize();
      const pos = acPos.clone().addScaledVector(flat, -120).addScaledVector(right, 78).addScaledVector(up, 20);
      const look = acPos.clone().addScaledVector(flat, 30).addScaledVector(up, -2);
      return { pos, look };
    }

    // Keep labels inside the viewport by moving their anchor (sprite.center) instead of clipping.
    const _p = new THREE.Vector3(), M = 0.03;
    function clampLabel(lab) {
      camera.updateMatrixWorld();
      _p.copy(lab.position).project(camera);
      const W = lab.scale.x * camera.projectionMatrix.elements[0], H = lab.scale.y * camera.projectionMatrix.elements[5];
      const cmin = 1 - (1 - M - _p.x) / W, cmax = (_p.x + 1 - M) / W;
      lab.center.x = THREE.MathUtils.clamp(0.5, Math.min(cmin, cmax), Math.max(cmin, cmax));
      lab.center.y = _p.y + 1.15 * H > 1 - M ? 1.15 : -0.15; // flip below the pin near the top edge
    }
    // Screen-space collision avoidance: stack overlapping labels vertically (alternating above/below
    // their pin), hide the lowest-priority ones if no free slot is found. Priority = pin order.
    const _q = new THREE.Vector3();
    function declutterLabels() {
      const placed = [];
      const ex = camera.projectionMatrix.elements;
      for (const pin of pins) {
        const lab = pin.userData.lab;
        _q.copy(lab.position).project(camera);
        if (_q.z > 1) { lab.visible = false; continue; }
        const W = lab.scale.x * ex[0], H = lab.scale.y * ex[5];
        const base = lab.center.y, x0 = _q.x - lab.center.x * W, x1 = x0 + W;
        const tries = [0, 1.1, -1.1, 2.2, -2.2, 3.3, -3.3];
        let ok = false;
        for (const d of tries) {
          const cy = base + d;
          const y0 = _q.y - cy * H, y1 = y0 + H;
          if (y1 > 1 - M || y0 < -1 + M) continue;
          if (placed.some((r) => x0 < r.x1 + 0.006 && x1 > r.x0 - 0.006 && y0 < r.y1 + 0.004 && y1 > r.y0 - 0.004)) continue;
          lab.center.y = cy; placed.push({ x0, x1, y0, y1 }); ok = true; break;
        }
        lab.visible = ok;
      }
    }
    function place(uu, dt = 0, snap = false) {
      const { param, idx } = uToParam(uu);
      const pos = curve.getPoint(param);
      const tan = curve.getTangent(Math.min(0.999, Math.max(0.001, param))).normalize();
      aircraft.position.copy(pos);
      acGlow.position.copy(pos);
      // orientation: nose along tangent, bank from turn rate
      const hdg = Math.atan2(tan.x, -tan.z);
      if (prevHdg != null && dt > 0) {
        let dh = hdg - prevHdg; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        const target = THREE.MathUtils.clamp((dh / Math.max(dt * speed, 1e-3)) * 9, -0.85, 0.85);
        bank += (target - bank) * Math.min(1, dt * 3);
      }
      prevHdg = hdg;
      const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), tan, up);
      aircraft.quaternion.setFromRotationMatrix(m);
      aircraft.rotateY(Math.PI / 2); // model nose +X → lookAt -Z
      aircraft.rotateX(bank);
      // strobe blink
      const st = aircraft.userData.strobe; if (st) st.material.opacity = (performance.now() % 1200) < 90 ? 1 : 0.15;
      prog.value = param;

      const chase = view === 'chase';
      const orbitSc = Math.max(acScale, orbitD * (view === 'focus' ? 0.013 : 0.017)); // readable at full-flight zoom
      const sc = THREE.MathUtils.lerp(aircraft.scale.x, chase ? 6 : orbitSc, snap ? 1 : Math.min(1, dt * 3));
      aircraft.scale.setScalar(sc); acGlow.scale.setScalar(sc * (chase ? 5 : 5)); acGlow.material.opacity = chase ? 0.0 : 0.55;
      marker.visible = !chase; marker.position.copy(pos); marker.material.rotation = performance.now() / 900;
      glowTube.visible = coreTube.visible = !chase; curtain.children[0].visible = !chase; chaseTube.visible = chase;
      for (const pin of pins) pin.userData.halo.visible = !chase;
      const tgt = view === 'chase' ? chaseTarget(pos, tan) : view === 'focus' ? focusTarget(uu) : orbitTarget();
      const k = snap || !camInit ? 1 : 1 - Math.exp(-dt * (view === 'chase' ? 2.2 : view === 'focus' ? 1.0 : 1.4));
      camPos.lerp(tgt.pos, k); camLook.lerp(tgt.look, k);
      if (!camInit || snap) { camPos.copy(tgt.pos); camLook.copy(tgt.look); camInit = true; }
      camera.position.copy(camPos); camera.lookAt(camLook);

      // pin pulse + label sizing
      const now = performance.now() / 1000;
      const lh = mobile ? 0.04 : 0.034;
      for (const pin of pins) {
        const near = Math.abs(pin.userData.u - uu) < 0.04;
        const s = 1 + 0.25 * Math.sin(now * 3 + pin.userData.u * 20) + (near ? 0.6 : 0);
        pin.userData.ring.scale.setScalar(s);
        pin.userData.halo.scale.setScalar(220 * (near ? 1.8 : 1));
        const lab = pin.userData.lab;
        lab.scale.set(lh * lab.userData.aspect / Math.max(0.6, Math.min(2.2, aspect)) * 1.0, lh, 1);
        clampLabel(lab);
      }
      declutterLabels();

      const p = points[idx];
      const tNow = t0 + uu * (t1 - t0);
      for (const fn of listeners.hud) fn({ altFt: p.altFt, gsKt: p.gsKt, hdgDeg: p.hdgDeg, t: tNow, u: uu });
      for (const fn of listeners.time) fn({ t: tNow, u: uu, playing, speed });
    }

    const startU = Number(new URLSearchParams(location.search).get('replayU'));
    if (Number.isFinite(startU) && startU > 0) { u = Math.min(1, startU); }
    const qv = new URLSearchParams(location.search).get('view');
    if (qv === 'chase' || qv === 'focus') view = qv;
    place(u, 0, true);

    function frame() {
      if (disposed) return;
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      const dt = Math.min(0.1, clock.getDelta());
      orbitT += dt;
      if (playing) {
        const dur = (t1 - t0) / 1000;
        u += (dt * speed) / Math.max(1, dur);
        if (u >= 1) u = 0;
      }
      place(u, dt);
      if (composer) composer.render(); else renderer.render(scene, camera);
    }
    frame();

    mountReplay3d._ctl = {
      play() { playing = true; },
      pause() { playing = false; },
      toggle() { playing = !playing; return playing; },
      setSpeed(s) { speed = Math.max(0.25, Math.min(8, Number(s) || 1)); },
      seek(uu) { u = Math.max(0, Math.min(1, uu)); place(u, 0); },
      seekTime(t) { u = Math.max(0, Math.min(1, (t - t0) / Math.max(1, t1 - t0))); place(u, 0); },
      setView(v) { view = ['chase', 'focus'].includes(v) ? v : 'orbit'; return view; },
      toggleView() { view = view === 'orbit' ? 'focus' : view === 'focus' ? 'chase' : 'orbit'; return view; },
      get view() { return view; },
      onTime(fn) { listeners.time.push(fn); },
      onHud(fn) { listeners.hud.push(fn); },
      get t0() { return t0; },
      get t1() { return t1; },
      destroy() {
        disposed = true; cancelAnimationFrame(raf); io.disconnect();
        window.removeEventListener('resize', resize); renderer?.dispose();
      },
    };
  })();

  return {
    ready,
    get controls() { return mountReplay3d._ctl; },
    get photo() { return photo; },
    destroy() { disposed = true; mountReplay3d._ctl?.destroy?.(); },
  };
}

export default mountReplay3d;
