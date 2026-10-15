/**
 * PilotLog cockpit 3D synthetic vision — Terrarium elevation + three.js.
 * Falls back by rejecting; caller keeps SVG visible.
 */
import * as THREE from '/js/three.module.min.js';

const KAPA = { lat: 39.5701, lon: -104.8484, elev: 1791 };
const DEG = Math.PI / 180;

function lonLatToTile(lon, lat, z) {
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const latRad = lat * DEG;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y, n };
}

function tilePixelToLonLat(z, tx, ty, px, py, size = 256) {
  const n = 2 ** z;
  const x = tx + px / size;
  const y = ty + py / size;
  const lon = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  return { lon, lat: latRad / DEG };
}

function terrariumElev(r, g, b) {
  return r * 256 + g + b / 256 - 32768;
}

/** Local ENU meters relative to KAPA (x=east, y=up, z=south). */
const VERT_EXAG = 2.4; // dramatic Front Range for synthetic vision
function toLocal(lon, lat, elevM) {
  const R = 6378137;
  const dLon = (lon - KAPA.lon) * DEG;
  const dLat = (lat - KAPA.lat) * DEG;
  const x = dLon * Math.cos(KAPA.lat * DEG) * R;
  const z = -dLat * R; // north → -z so +z is south; looking west is -x
  const y = (elevM - KAPA.elev) * VERT_EXAG;
  return { x, y, z };
}

function makeDa40() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xa5f3fc,
    emissive: 0x22d3ee,
    emissiveIntensity: 0.85,
    metalness: 0.2,
    roughness: 0.25,
    transparent: true,
    opacity: 0.98,
  });
  const fuselage = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 2.4, 4, 8), mat);
  fuselage.rotation.z = Math.PI / 2;
  g.add(fuselage);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.08, 0.7), mat);
  wing.position.set(0, -0.05, 0);
  g.add(wing);
  const hstab = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 0.35), mat);
  hstab.position.set(-1.35, 0.15, 0);
  g.add(hstab);
  const vstab = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.45), mat);
  vstab.position.set(-1.35, 0.45, 0);
  g.add(vstab);
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.38, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.45, emissive: 0x22d3ee, emissiveIntensity: 0.2 })
  );
  canopy.position.set(0.35, 0.25, 0);
  g.add(canopy);
  g.scale.setScalar(55);
  return g;
}

function makeGate(label, lit) {
  const g = new THREE.Group();
  const color = lit ? 0xf472d0 : 0x5b6478;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(140, 7, 10, 48),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: lit ? 0.9 : 0.15,
      transparent: true,
      opacity: lit ? 0.95 : 0.45,
    })
  );
  ring.rotation.y = Math.PI / 2;
  g.add(ring);
  const inner = new THREE.Mesh(
    new THREE.TorusGeometry(85, 3.5, 8, 32),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: lit ? 0.6 : 0.08,
      transparent: true,
      opacity: 0.5,
    })
  );
  inner.rotation.y = Math.PI / 2;
  g.add(inner);
  if (lit) {
    const glow = new THREE.PointLight(0xf472d0, 4.5, 1200, 2);
    g.add(glow);
  }
  // label sprite
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 64);
  ctx.font = '700 36px ui-monospace, monospace';
  ctx.fillStyle = lit ? '#f5b8e6' : '#7d8aa5';
  ctx.textAlign = 'center';
  ctx.fillText(label.toUpperCase(), 128, 42);
  const tex = new THREE.CanvasTexture(c);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set(320, 80, 1);
  sprite.position.y = 200;
  g.add(sprite);
  return g;
}

async function loadHeightmap({ z = 10, mobile = false } = {}) {
  const k = lonLatToTile(KAPA.lon, KAPA.lat, z);
  const tx0 = Math.floor(k.x) - 2;
  const tx1 = Math.floor(k.x) + 1;
  const ty0 = Math.floor(k.y) - 1;
  const ty1 = Math.floor(k.y) + 1;
  const tilesX = tx1 - tx0 + 1;
  const tilesY = ty1 - ty0 + 1;
  const step = mobile ? 8 : 4; // sample every N pixels
  const tw = Math.ceil(256 / step);
  const cols = tilesX * tw;
  const rows = tilesY * tw;
  const elev = new Float32Array(cols * rows);
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const jobs = [];
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      jobs.push(
        fetch(`/api/terrain/${z}/${tx}/${ty}.png`)
          .then((r) => {
            if (!r.ok) throw new Error('tile ' + r.status);
            return r.blob();
          })
          .then((b) => createImageBitmap(b))
          .then((bmp) => {
            ctx.clearRect(0, 0, 256, 256);
            ctx.drawImage(bmp, 0, 0);
            const data = ctx.getImageData(0, 0, 256, 256).data;
            const ox = (tx - tx0) * tw;
            const oy = (ty - ty0) * tw;
            for (let py = 0, ry = 0; py < 256; py += step, ry++) {
              for (let px = 0, rx = 0; px < 256; px += step, rx++) {
                const i = (py * 256 + px) * 4;
                elev[(oy + ry) * cols + (ox + rx)] = terrariumElev(data[i], data[i + 1], data[i + 2]);
              }
            }
          })
      );
    }
  }
  await Promise.all(jobs);

  // corners in local space
  const nw = tilePixelToLonLat(z, tx0, ty0, 0, 0);
  const se = tilePixelToLonLat(z, tx1, ty1, 255, 255);
  const pNW = toLocal(nw.lon, nw.lat, 0);
  const pSE = toLocal(se.lon, se.lat, 0);
  const widthM = Math.abs(pSE.x - pNW.x);
  const depthM = Math.abs(pSE.z - pNW.z);

  return { elev, cols, rows, widthM, depthM, originX: pNW.x, originZ: pNW.z, tx0, ty0, z, step };
}

function gridLonLat(hm, ix, iy) {
  const tw = Math.ceil(256 / hm.step);
  const tileX = hm.tx0 + Math.floor(ix / tw);
  const tileY = hm.ty0 + Math.floor(iy / tw);
  const px = (ix % tw) * hm.step;
  const py = (iy % tw) * hm.step;
  return tilePixelToLonLat(hm.z, tileX, tileY, px, py);
}

function buildTerrainMesh(hm) {
  const { elev, cols, rows } = hm;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(cols * rows * 3);
  const colors = new Float32Array(cols * rows * 3);
  const color = new THREE.Color();

  for (let iy = 0; iy < rows; iy++) {
    for (let ix = 0; ix < cols; ix++) {
      const idx = iy * cols + ix;
      const e = elev[idx];
      const ll = gridLonLat(hm, ix, iy);
      const p = toLocal(ll.lon, ll.lat, e);
      positions[idx * 3] = p.x;
      positions[idx * 3 + 1] = p.y;
      positions[idx * 3 + 2] = p.z;

      const t = THREE.MathUtils.clamp((e - 1600) / 2600, 0, 1);
      if (t < 0.3) color.setHSL(0.58, 0.35, 0.12 + t * 0.35);
      else if (t < 0.65) color.setHSL(0.08, 0.35, 0.22 + (t - 0.3) * 0.45);
      else color.setHSL(0.09, 0.08, 0.55 + (t - 0.65) * 1.0);
      // warm sunrise wash on highs
      color.r = Math.min(1, color.r + 0.12 + t * 0.1);
      color.g = Math.min(1, color.g + 0.05);
      colors[idx * 3] = color.r;
      colors[idx * 3 + 1] = color.g;
      colors[idx * 3 + 2] = color.b;
    }
  }

  const indices = [];
  for (let iy = 0; iy < rows - 1; iy++) {
    for (let ix = 0; ix < cols - 1; ix++) {
      const a = iy * cols + ix;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0.04,
  });
  return new THREE.Mesh(geo, mat);
}

function sampleElev(hm, lon, lat) {
  const p = toLocal(lon, lat, KAPA.elev);
  let best = KAPA.elev;
  let bestD = Infinity;
  const { elev, cols, rows } = hm;
  for (let iy = 0; iy < rows; iy += 2) {
    for (let ix = 0; ix < cols; ix += 2) {
      const ll = gridLonLat(hm, ix, iy);
      const q = toLocal(ll.lon, ll.lat, elev[iy * cols + ix]);
      const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = elev[iy * cols + ix];
      }
    }
  }
  return best;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ gates: {key,label,done}[], current: number }} gateState
 * @returns {{ destroy: Function, ready: Promise<void> }}
 */
export function mountSynth3d(canvas, gateState) {
  let disposed = false;
  let raf = 0;
  let visible = true;
  let renderer, scene, camera, aircraft, pathLine;
  const gates3d = [];
  const clock = new THREE.Clock();

  const mobile = window.matchMedia('(max-width: 720px)').matches || (navigator.maxTouchPoints || 0) > 0;
  const ready = (async () => {
    if (!window.WebGLRenderingContext) throw new Error('no webgl');

    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !mobile,
      alpha: false,
      powerPreference: 'high-performance',
    });
    const pr = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.6);
    renderer.setPixelRatio(pr);
    renderer.setClearColor(0x1a0a2e, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x2a1520, 0.000028);

    // sky dome
    const skyGeo = new THREE.SphereGeometry(80000, 24, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {},
      vertexShader: `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vW=normalize(w.xyz); gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `varying vec3 vW; void main(){
        float h = clamp(vW.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 top = vec3(0.08, 0.04, 0.18);
        vec3 mid = vec3(0.55, 0.22, 0.28);
        vec3 hor = vec3(0.95, 0.55, 0.25);
        vec3 col = mix(hor, mid, smoothstep(0.0, 0.45, h));
        col = mix(col, top, smoothstep(0.4, 1.0, h));
        // sun glow west-ish
        vec3 sunDir = normalize(vec3(-0.85, 0.12, 0.1));
        float sun = pow(max(dot(normalize(vW), sunDir), 0.0), 32.0);
        col += vec3(1.0, 0.75, 0.35) * sun * 0.85;
        gl_FragColor = vec4(col, 1.0);
      }`,
    });
    scene.add(new THREE.Mesh(skyGeo, skyMat));

    const hemi = new THREE.HemisphereLight(0xffd0b0, 0x1a2030, 0.85);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffc080, 2.1);
    sun.position.set(-4000, 1200, 800);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x88aaff, 0.45);
    fill.position.set(2000, 800, -1500);
    scene.add(fill);
    scene.add(new THREE.AmbientLight(0x405060, 0.35));

    const hm = await loadHeightmap({ z: mobile ? 10 : 10, mobile });
    if (disposed) return;
    const terrain = buildTerrainMesh(hm);
    scene.add(terrain);

    // Ground grid hint near KAPA
    const grid = new THREE.GridHelper(6000, 40, 0x22d3ee, 0x0a2030);
    grid.position.y = 5;
    grid.material.opacity = 0.18;
    grid.material.transparent = true;
    scene.add(grid);

    // Path + gates west of KAPA (toward Front Range)
    const gateDefs = gateState.gates || [];
    const pathPts = [];
    for (let i = 0; i < gateDefs.length; i++) {
      const t = i / Math.max(1, gateDefs.length - 1);
      const lon = KAPA.lon - 0.04 - t * 0.28; // west toward Front Range
      const lat = KAPA.lat + 0.015 * Math.sin(t * Math.PI) - t * 0.015;
      const e = sampleElev(hm, lon, lat);
      const p = toLocal(lon, lat, e + 280 + t * 180);
      pathPts.push(new THREE.Vector3(p.x, p.y, p.z));
      const lit = !!gateDefs[i].done || i === gateState.current;
      const gate = makeGate(gateDefs[i].label, lit);
      gate.position.copy(pathPts[i]);
      scene.add(gate);
      gates3d.push(gate);
    }

    const curve = new THREE.CatmullRomCurve3(pathPts);
    const pathGeo = new THREE.TubeGeometry(curve, 96, 14, 10, false);
    pathLine = new THREE.Mesh(
      pathGeo,
      new THREE.MeshBasicMaterial({ color: 0xf472d0, transparent: true, opacity: 0.95 })
    );
    scene.add(pathLine);
    // soft outer glow tube
    const glowTube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 64, 22, 8, false),
      new THREE.MeshBasicMaterial({ color: 0xf472d0, transparent: true, opacity: 0.28 })
    );
    scene.add(glowTube);

    aircraft = makeDa40();
    const ci = Math.min(gateState.current || 0, pathPts.length - 1);
    // Sit between first gates so Solo/XC rings + plane are in view toward mountains
    const u = 0.12;
    const pos = curve.getPoint(u);
    const tangent = curve.getTangent(u).normalize();
    aircraft.position.copy(pos);
    aircraft.lookAt(pos.clone().add(tangent));
    scene.add(aircraft);

    camera = new THREE.PerspectiveCamera(48, 1, 5, 120000);
    // Three-quarter rear view — aircraft large in lower-left/center
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize().multiplyScalar(280);
    const camBase = pos.clone()
      .add(tangent.clone().multiplyScalar(-380))
      .add(side)
      .add(new THREE.Vector3(0, 140, 0));
    camera.position.copy(camBase);

    function resize() {
      const w = canvas.clientWidth || canvas.parentElement?.clientWidth || 640;
      const h = canvas.clientHeight || canvas.parentElement?.clientHeight || 420;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener('resize', resize);

    const lookTarget = curve.getPoint(0.55);

    const io = new IntersectionObserver(
      (entries) => {
        visible = entries.some((e) => e.isIntersecting);
      },
      { threshold: 0.05 }
    );
    io.observe(canvas);

    function frame() {
      if (disposed) return;
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      const t = clock.getElapsedTime();
      // slow cinematic drift around chase position
      camera.position.x = camBase.x + Math.sin(t * 0.06) * 90;
      camera.position.y = camBase.y + Math.sin(t * 0.09) * 28;
      camera.position.z = camBase.z + Math.cos(t * 0.05) * 70;
      camera.lookAt(lookTarget.x, lookTarget.y + 40, lookTarget.z);
      if (aircraft) {
        aircraft.position.y = pos.y + Math.sin(t * 0.85) * 6;
      }
      for (const g of gates3d) {
        g.rotation.y = t * 0.25;
      }
      renderer.render(scene, camera);
    }
    frame();

    // expose destroy hooks
    mountSynth3d._last = {
      destroy() {
        disposed = true;
        cancelAnimationFrame(raf);
        io.disconnect();
        window.removeEventListener('resize', resize);
        renderer?.dispose();
        scene?.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
            else o.material.dispose();
          }
        });
      },
    };
  })();

  return {
    ready,
    destroy() {
      disposed = true;
      cancelAnimationFrame(raf);
      mountSynth3d._last?.destroy?.();
    },
  };
}

export default mountSynth3d;
