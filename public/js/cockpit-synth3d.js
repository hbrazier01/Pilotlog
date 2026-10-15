/**
 * PilotLog cockpit 3D synthetic vision — Terrarium elevation + three.js.
 * Concept: cyan wireframe DA40, thin dashed magenta path, tall rectangular
 * gates, Front Range at sunrise with snow ridges + plains HUD grid.
 * Falls back by rejecting; caller keeps SVG visible.
 */
import * as THREE from '/js/three.module.min.js';

const KAPA = { lat: 39.5701, lon: -104.8484, elev: 1791 };
const DEG = Math.PI / 180;
const VERT_EXAG = 3.2;

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
function toLocal(lon, lat, elevM) {
  const R = 6378137;
  const dLon = (lon - KAPA.lon) * DEG;
  const dLat = (lat - KAPA.lat) * DEG;
  const x = dLon * Math.cos(KAPA.lat * DEG) * R;
  const z = -dLat * R;
  const y = (elevM - KAPA.elev) * VERT_EXAG;
  return { x, y, z };
}

function glowLineMat(color, opacity = 0.95) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/** Sleek low-wing DA40: tapered wings, T-tail, canopy — cyan translucent + wire glow. */
function makeDa40() {
  const g = new THREE.Group();
  const fill = new THREE.MeshBasicMaterial({
    color: 0x67e8f9,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const edgeMat = new THREE.LineBasicMaterial({
    color: 0xa5f3fc,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  function part(geo, pos, rot = [0, 0, 0], scale = [1, 1, 1]) {
    const m = new THREE.Mesh(geo, fill.clone());
    m.position.set(...pos);
    m.rotation.set(...rot);
    m.scale.set(...scale);
    g.add(m);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 15), edgeMat.clone());
    e.position.copy(m.position);
    e.rotation.copy(m.rotation);
    e.scale.copy(m.scale);
    g.add(e);
  }

  // Fuselage body (nose toward +X)
  part(new THREE.CylinderGeometry(0.22, 0.32, 2.4, 12), [0.1, 0.08, 0], [0, 0, Math.PI / 2]);
  part(new THREE.ConeGeometry(0.22, 0.85, 12), [1.55, 0.08, 0], [0, 0, -Math.PI / 2]);
  part(new THREE.CylinderGeometry(0.12, 0.22, 1.1, 10), [-1.4, 0.12, 0], [0, 0, Math.PI / 2]);
  // Canopy bubble
  part(new THREE.SphereGeometry(0.4, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), [0.45, 0.35, 0]);
  // Long low wing
  part(new THREE.BoxGeometry(0.9, 0.045, 5.6), [0.2, -0.06, 0]);
  part(new THREE.BoxGeometry(0.4, 0.03, 0.85), [0.05, -0.05, 2.55]);
  part(new THREE.BoxGeometry(0.4, 0.03, 0.85), [0.05, -0.05, -2.55]);
  // T-tail
  part(new THREE.BoxGeometry(0.55, 0.9, 0.055), [-1.85, 0.58, 0]);
  part(new THREE.BoxGeometry(0.42, 0.04, 1.55), [-1.85, 1.02, 0]);
  // Prop disc
  const prop = new THREE.Mesh(
    new THREE.RingGeometry(0.08, 0.55, 24),
    new THREE.MeshBasicMaterial({
      color: 0x67e8f9,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  prop.position.set(1.95, 0.08, 0);
  prop.rotation.y = Math.PI / 2;
  g.add(prop);
  const light = new THREE.PointLight(0x22d3ee, 1.8, 800, 2);
  light.position.set(0, 0.4, 0);
  g.add(light);
  return g;
}

function makeGate(label, lit) {
  const g = new THREE.Group();
  const col = lit ? 0xf472d0 : 0x6b7280;
  const intens = lit ? 1 : 0.25;
  const bar = (w, h, d, x, y, z) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: lit ? 0.85 : 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    mesh.position.set(x, y, z);
    g.add(mesh);
    // outer glow shell
    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(w * 1.35, h * 1.15, d * 1.35),
      new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: lit ? 0.18 : 0.06,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    shell.position.copy(mesh.position);
    g.add(shell);
  };

  const W = 300; // opening width
  const H = 420; // opening height
  const T = 14; // thickness
  // left / right posts
  bar(T, H + T * 2, T, 0, H / 2, W / 2);
  bar(T, H + T * 2, T, 0, H / 2, -W / 2);
  // top / bottom
  bar(T, T, W + T * 2, 0, H + T / 2, 0);
  bar(T, T, W + T * 2, 0, -T / 2, 0);
  // thin cross accents
  bar(T * 0.5, T * 0.5, W * 0.9, 0, H * 0.5, 0);

  if (lit) {
    const pl = new THREE.PointLight(0xf472d0, 3.5 * intens, 900, 2);
    pl.position.set(0, H * 0.5, 0);
    g.add(pl);
  }

  // Label sprite above gate
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 512, 128);
  ctx.font = '800 84px ui-monospace, SF Mono, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = lit ? '#f472d0' : '#000';
  ctx.shadowBlur = lit ? 24 : 0;
  ctx.fillStyle = lit ? '#fce7f3' : '#94a3b8';
  ctx.fillText(String(label).toUpperCase(), 256, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, blending: THREE.AdditiveBlending })
  );
  sprite.scale.set(480, 120, 1);
  sprite.position.set(0, H + 130, 0);
  g.add(sprite);

  // Face gates toward camera path (local +X is forward through gate)
  return g;
}

async function loadHeightmap({ z = 10, mobile = false } = {}) {
  const k = lonLatToTile(KAPA.lon, KAPA.lat, z);
  // Bias west (+mountains) and a bit north/south for Front Range ridge
  const tx0 = Math.floor(k.x) - 3;
  const tx1 = Math.floor(k.x) + 1;
  const ty0 = Math.floor(k.y) - 2;
  const ty1 = Math.floor(k.y) + 2;
  const tilesX = tx1 - tx0 + 1;
  const tilesY = ty1 - ty0 + 1;
  const step = mobile ? 8 : 4;
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
  return { elev, cols, rows, tx0, ty0, z, step };
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

      // Plains dark green → foothills → snow ridges
      const t = THREE.MathUtils.clamp((e - 1500) / 2600, 0, 1);
      if (t < 0.2) {
        color.setRGB(0.1 + t * 0.15, 0.18 + t * 0.22, 0.11 + t * 0.1);
      } else if (t < 0.5) {
        const u = (t - 0.2) / 0.3;
        color.setRGB(0.18 + u * 0.2, 0.2 + u * 0.08, 0.14 + u * 0.04);
      } else {
        const u = (t - 0.5) / 0.5;
        // bright snow ridges
        color.setRGB(0.72 + u * 0.28, 0.74 + u * 0.24, 0.78 + u * 0.2);
      }
      if (t > 0.55) {
        color.r = Math.min(1, color.r + 0.06);
      }
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
  return new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.02,
      flatShading: false,
    })
  );
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

/** Thin dashed magenta path + additive glow ribbon. */
function makeDashedPath(curve) {
  const group = new THREE.Group();
  const pts = curve.getPoints(120);
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const dashed = new THREE.Line(
    geo,
    new THREE.LineDashedMaterial({
      color: 0xf472d0,
      dashSize: 70,
      gapSize: 40,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  dashed.computeLineDistances();
  group.add(dashed);

  // Additive glow core (very thin tube)
  const glow = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 100, 3.2, 6, false),
    glowLineMat(0xf472d0, 0.55)
  );
  group.add(glow);
  const halo = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 80, 9, 6, false),
    glowLineMat(0xf472d0, 0.18)
  );
  group.add(halo);

  // Progress nodes along path
  for (let i = 0; i < pts.length; i += 15) {
    const n = new THREE.Mesh(
      new THREE.SphereGeometry(6, 10, 10),
      glowLineMat(0xf9a8d4, 0.9)
    );
    n.position.copy(pts[i]);
    group.add(n);
  }
  return group;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ gates: {key,label,done}[], current: number }} gateState
 */
export function mountSynth3d(canvas, gateState) {
  let disposed = false;
  let raf = 0;
  let visible = true;
  let renderer, scene, camera, aircraft;
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
    const pr = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.75);
    renderer.setPixelRatio(pr);
    renderer.setClearColor(0x1a0a28, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    scene = new THREE.Scene();
    // Haze — warm near horizon
    scene.fog = new THREE.FogExp2(0x2a1824, mobile ? 0.000028 : 0.000022);

    // Sky: sunrise behind western mountains
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vW=normalize(position); gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `varying vec3 vW; void main(){
        float h = clamp(vW.y * 0.55 + 0.42, 0.0, 1.0);
        vec3 zenith = vec3(0.06, 0.03, 0.14);
        vec3 mid = vec3(0.42, 0.14, 0.28);
        vec3 horizon = vec3(0.98, 0.62, 0.28);
        vec3 col = mix(horizon, mid, smoothstep(0.0, 0.38, h));
        col = mix(col, zenith, smoothstep(0.32, 0.95, h));
        // sun disk glow just above west horizon
        vec3 sunDir = normalize(vec3(-0.92, 0.08, 0.05));
        float sun = pow(max(dot(normalize(vW), sunDir), 0.0), 48.0);
        float glow = pow(max(dot(normalize(vW), sunDir), 0.0), 6.0);
        col += vec3(1.0, 0.78, 0.4) * sun * 1.1;
        col += vec3(0.95, 0.45, 0.25) * glow * 0.35;
        gl_FragColor = vec4(col, 1.0);
      }`,
    });
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(90000, 32, 20), skyMat));

    scene.add(new THREE.HemisphereLight(0xffd0b0, 0x1a2838, 0.85));
    // Sunrise west-northwest — illuminates snow faces, not pure backlight silhouette
    const sun = new THREE.DirectionalLight(0xffc090, 1.55);
    sun.position.set(-4200, 1800, 1600);
    scene.add(sun);
    const fillL = new THREE.DirectionalLight(0xa8c4ff, 0.75);
    fillL.position.set(3500, 2200, -1200);
    scene.add(fillL);
    const rim = new THREE.DirectionalLight(0xff8844, 0.55);
    rim.position.set(-2000, 800, -2500);
    scene.add(rim);
    scene.add(new THREE.AmbientLight(0x3a4558, 0.55));

    const hm = await loadHeightmap({ z: 10, mobile });
    if (disposed) return;
    scene.add(buildTerrainMesh(hm));

    // HUD grid over plains near KAPA
    const grid = new THREE.GridHelper(9000, 60, 0x22d3ee, 0x0c1a28);
    grid.position.set(0, 8, 0);
    grid.material.opacity = 0.32;
    grid.material.transparent = true;
    scene.add(grid);
    // Perspective grid lines fading west
    const grid2 = new THREE.GridHelper(14000, 28, 0x22d3ee, 0x101828);
    grid2.position.set(-4000, 6, 0);
    grid2.material.opacity = 0.1;
    grid2.material.transparent = true;
    scene.add(grid2);

    // Path + tall rectangular gates west toward Front Range
    const gateDefs = gateState.gates || [
      { key: 'solo', label: 'Solo', done: false },
      { key: 'xc', label: 'XC', done: false },
      { key: 'night', label: 'Night', done: false },
      { key: 'checkride', label: 'Checkride', done: false },
    ];
    // Build a long curve; place aircraft near start, all four gates ahead and spaced for readability
    const pathPts = [];
    const samples = 8;
    for (let i = 0; i < samples; i++) {
      const t = i / (samples - 1);
      const lon = KAPA.lon - 0.01 - t * 0.32;
      const lat = KAPA.lat + 0.018 * Math.sin(t * Math.PI) - t * 0.006;
      const e = sampleElev(hm, lon, lat);
      const alt = e + 300 + t * 220;
      const p = toLocal(lon, lat, alt);
      pathPts.push(new THREE.Vector3(p.x, p.y, p.z));
    }
    const curve = new THREE.CatmullRomCurve3(pathPts, false, 'catmullrom', 0.45);
    scene.add(makeDashedPath(curve));

    // Gate U positions along curve (all ahead of aircraft)
    const gateUs = [0.16, 0.32, 0.48, 0.64];
    for (let i = 0; i < gateDefs.length; i++) {
      const lit = !!gateDefs[i].done || i === gateState.current;
      const gate = makeGate(gateDefs[i].label, lit);
      const gu = gateUs[i];
      const gp = curve.getPoint(gu);
      const tan = curve.getTangent(gu).normalize();
      gate.position.copy(gp);
      gate.lookAt(gp.clone().add(tan));
      gate.rotateY(Math.PI / 2);
      scene.add(gate);
      gates3d.push(gate);
    }

    // Aircraft — full airframe, ~1/3 hero width, centered lower-middle
    aircraft = makeDa40();
    const planeU = 0.05;
    const pos = curve.getPoint(planeU);
    const tangent = curve.getTangent(planeU).normalize();
    aircraft.position.copy(pos);
    aircraft.lookAt(pos.clone().add(tangent));
    aircraft.rotateY(-Math.PI / 2);
    aircraft.scale.setScalar(mobile ? 70 : 92);
    scene.add(aircraft);

    camera = new THREE.PerspectiveCamera(mobile ? 42 : 38, 1, 2, 140000);
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(tangent, up).normalize();
    // Pull back + side so entire DA40 is in frame and near horizontal center
    const camBase = pos.clone()
      .add(tangent.clone().multiplyScalar(mobile ? -1100 : -1350))
      .add(right.clone().multiplyScalar(mobile ? 380 : 480))
      .add(up.clone().multiplyScalar(mobile ? 320 : 380));
    camera.position.copy(camBase);
    // Look at a point just ahead of the plane (not the far horizon) so the
    // aircraft sits mid-frame and the horizon falls near the upper third.
    const lookTarget = pos.clone()
      .add(tangent.clone().multiplyScalar(1100))
      .add(up.clone().multiplyScalar(-120));

    function resize() {
      const w = canvas.clientWidth || canvas.parentElement?.clientWidth || 640;
      const h = canvas.clientHeight || canvas.parentElement?.clientHeight || 420;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener('resize', resize);

    const io = new IntersectionObserver(
      (entries) => {
        visible = entries.some((e) => e.isIntersecting);
      },
      { threshold: 0.05 }
    );
    io.observe(canvas);

    // Initial look
    camera.lookAt(lookTarget);

    function frame() {
      if (disposed) return;
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      const t = clock.getElapsedTime();
      camera.position.x = camBase.x + Math.sin(t * 0.045) * 40;
      camera.position.y = camBase.y + Math.sin(t * 0.06) * 14;
      camera.position.z = camBase.z + Math.cos(t * 0.04) * 30;
      camera.lookAt(lookTarget.x, lookTarget.y + Math.sin(t * 0.035) * 10, lookTarget.z);
      if (aircraft) {
        aircraft.position.y = pos.y + Math.sin(t * 0.7) * 5;
        aircraft.rotation.z = Math.sin(t * 0.35) * 0.03;
      }
      renderer.render(scene, camera);
    }
    frame();

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
