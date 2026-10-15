/**
 * Flight replay 3D — cyan track ribbon + DA40 over Terrarium terrain (KAPA).
 * Stylized terrain (no Esri imagery — commercial use needs ArcGIS/Cesium key).
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
    color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

/** Sleek low-wing DA40: tapered wings, T-tail, canopy — cyan translucent + wire glow. */
function makeDa40() {
  const g = new THREE.Group();
  const CYAN = 0x22d3ee;
  const fill = new THREE.MeshBasicMaterial({
    color: CYAN,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const edgeMat = new THREE.LineBasicMaterial({
    color: CYAN,
    transparent: true,
    opacity: 1,
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
  // Subtle prop disc (thin cyan ring, low opacity — not a big white circle)
  const prop = new THREE.Mesh(
    new THREE.RingGeometry(0.22, 0.38, 28),
    new THREE.MeshBasicMaterial({
      color: CYAN,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  prop.position.set(1.95, 0.08, 0);
  prop.rotation.y = Math.PI / 2;
  g.add(prop);
  const light = new THREE.PointLight(0x22d3ee, 2.4, 900, 2);
  light.position.set(0, 0.4, 0);
  g.add(light);
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
        // bright snow-capped peaks
        color.setRGB(0.82 + u * 0.18, 0.84 + u * 0.16, 0.88 + u * 0.12);
      }
      if (t > 0.48) {
        color.r = Math.min(1, color.r + 0.1);
        color.g = Math.min(1, color.g + 0.08);
        color.b = Math.min(1, color.b + 0.1);
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



function toLocalFt(lon, lat, altFt) {
  return toLocal(lon, lat, (altFt || KAPA.elev * 3.28084) / 3.28084);
}

function buildTrackCurve(points) {
  const vecs = points.map((p) => {
    const q = toLocalFt(p.lon, p.lat, p.altFt);
    return new THREE.Vector3(q.x, q.y, q.z);
  });
  return new THREE.CatmullRomCurve3(vecs, false, 'catmullrom', 0.15);
}

function makeCyanRibbon(curve) {
  const g = new THREE.Group();
  const pts = curve.getPoints(Math.min(400, Math.max(80, curve.points.length * 2)));
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const dashed = new THREE.Line(geo, new THREE.LineDashedMaterial({
    color: 0x22d3ee, dashSize: 60, gapSize: 35, transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  dashed.computeLineDistances();
  g.add(dashed);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 5, 8, false), glowLineMat(0x22d3ee, 0.65)));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 100, 14, 8, false), glowLineMat(0x67e8f9, 0.18)));
  return g;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ points: any[], events?: any[] }} track
 */
export function mountReplay3d(canvas, track) {
  let disposed = false, raf = 0, visible = true;
  let renderer, scene, camera, aircraft, curve, composer = null;
  let playing = true, speed = 1, u = 0;
  const clock = new THREE.Clock();
  const mobile = window.matchMedia('(max-width: 720px)').matches || (navigator.maxTouchPoints || 0) > 0;
  const points = track.points || [];
  const t0 = points[0]?.t || 0;
  const t1 = points[points.length - 1]?.t || 1;
  const listeners = { time: [], hud: [] };

  const ready = (async () => {
    if (!points.length) throw new Error('empty track');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.75));
    renderer.setClearColor(0x1a0a28, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x24141f, mobile ? 0.000034 : 0.000026);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      vertexShader: `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vW=normalize(position); gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `varying vec3 vW; void main(){
        float h = clamp(vW.y * 0.55 + 0.42, 0.0, 1.0);
        vec3 zenith = vec3(0.06, 0.03, 0.14);
        vec3 mid = vec3(0.42, 0.14, 0.28);
        vec3 horizon = vec3(0.98, 0.62, 0.28);
        vec3 col = mix(horizon, mid, smoothstep(0.0, 0.38, h));
        col = mix(col, zenith, smoothstep(0.32, 0.95, h));
        vec3 sunDir = normalize(vec3(-0.92, 0.08, 0.05));
        float sun = pow(max(dot(normalize(vW), sunDir), 0.0), 48.0);
        float glow = pow(max(dot(normalize(vW), sunDir), 0.0), 6.0);
        col += vec3(1.0, 0.78, 0.4) * sun * 1.1;
        col += vec3(0.95, 0.45, 0.25) * glow * 0.35;
        gl_FragColor = vec4(col, 1.0);
      }`,
    });
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(90000, 32, 20), skyMat));
    scene.add(new THREE.HemisphereLight(0xffd8c0, 0x152030, 1.0));
    const sun = new THREE.DirectionalLight(0xffd0a0, 1.7);
    sun.position.set(-4800, 2200, 1400); scene.add(sun);
    scene.add(new THREE.DirectionalLight(0xa8c4ff, 0.7));
    scene.add(new THREE.AmbientLight(0x4a5568, 0.6));

    const hm = await loadHeightmap({ z: 10, mobile });
    if (disposed) return;
    scene.add(buildTerrainMesh(hm));
    const grid = new THREE.GridHelper(9000, 60, 0x22d3ee, 0x0c1a28);
    grid.position.set(0, 8, 0); grid.material.opacity = 0.28; grid.material.transparent = true;
    scene.add(grid);

    curve = buildTrackCurve(points);
    scene.add(makeCyanRibbon(curve));

    aircraft = makeDa40();
    aircraft.scale.setScalar(mobile ? 48 : 62);
    scene.add(aircraft);

    camera = new THREE.PerspectiveCamera(mobile ? 42 : 38, 1, 2, 140000);

    if (!mobile) {
      try {
        const { EffectComposer } = await import('/js/pp/EffectComposer.js');
        const { RenderPass } = await import('/js/pp/RenderPass.js');
        const { UnrealBloomPass } = await import('/js/pp/UnrealBloomPass.js');
        const { OutputPass } = await import('/js/pp/OutputPass.js');
        renderer.toneMapping = THREE.NoToneMapping;
        composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));
        composer.addPass(new UnrealBloomPass(new THREE.Vector2(512, 512), 0.5, 0.38, 0.8));
        composer.addPass(new OutputPass());
      } catch { composer = null; renderer.toneMapping = THREE.ACESFilmicToneMapping; }
    }

    function resize() {
      const w = canvas.clientWidth || 640, h = canvas.clientHeight || 420;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      if (composer) { composer.setSize(w, h); composer.setPixelRatio(renderer.getPixelRatio()); }
    }
    resize();
    window.addEventListener('resize', resize);
    const io = new IntersectionObserver((entries) => { visible = entries.some((e) => e.isIntersecting); }, { threshold: 0.05 });
    io.observe(canvas);

    function sampleAtU(uu) {
      const pos = curve.getPoint(uu);
      const tan = curve.getTangent(uu).normalize();
      // nearest point for HUD
      const idx = Math.min(points.length - 1, Math.max(0, Math.round(uu * (points.length - 1))));
      const p = points[idx];
      return { pos, tan, p, idx };
    }

    function place(uu) {
      const { pos, tan, p } = sampleAtU(uu);
      aircraft.position.copy(pos);
      aircraft.lookAt(pos.clone().add(tan));
      aircraft.rotateY(-Math.PI / 2);
      const up = new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3().crossVectors(tan, up).normalize();
      const camPos = pos.clone()
        .add(tan.clone().multiplyScalar(mobile ? -900 : -1200))
        .add(right.clone().multiplyScalar(mobile ? 180 : 240))
        .add(up.clone().multiplyScalar(mobile ? 280 : 340));
      camera.position.lerp(camPos, 0.15);
      camera.lookAt(pos.clone().add(tan.clone().multiplyScalar(600)).add(up.clone().multiplyScalar(-40)));
      const tNow = t0 + uu * (t1 - t0);
      for (const fn of listeners.hud) fn({
        altFt: p.altFt, gsKt: p.gsKt, hdgDeg: p.hdgDeg, t: tNow, u: uu,
      });
      for (const fn of listeners.time) fn({ t: tNow, u: uu, playing, speed });
    }

    place(0);

    function frame() {
      if (disposed) return;
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      const dt = clock.getDelta();
      if (playing) {
        const dur = (t1 - t0) / 1000;
        u += (dt * speed) / Math.max(1, dur);
        if (u >= 1) { u = 0; }
      }
      place(u);
      if (composer) composer.render();
      else renderer.render(scene, camera);
    }
    frame();

    mountReplay3d._ctl = {
      play() { playing = true; },
      pause() { playing = false; },
      toggle() { playing = !playing; return playing; },
      setSpeed(s) { speed = Math.max(0.25, Math.min(8, Number(s) || 1)); },
      seek(uu) { u = Math.max(0, Math.min(1, uu)); place(u); },
      seekTime(t) { u = (t - t0) / Math.max(1, t1 - t0); place(u); },
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
    destroy() { disposed = true; mountReplay3d._ctl?.destroy?.(); },
  };
}

export default mountReplay3d;
