/**
 * Low-poly procedural trainer models (nose +X, up +Y, right wing +Z, ~meters).
 * Families: cessna-high (172/152), piper-low (PA-28), diamond-t (DA40/DA20),
 * cirrus-low (SR20), generic-low (Other). All share nav lights + tail strobe.
 */
import * as THREE from '/js/three.module.min.js';
import { aircraftModelFor } from '/js/aircraft-types.js';

let _glow;
export function glowTexture() {
  if (_glow) return _glow;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  _glow = new THREE.CanvasTexture(c);
  return _glow;
}

function mats() {
  return {
    body: new THREE.MeshStandardMaterial({ color: 0xe8edf5, roughness: 0.45, metalness: 0.15, emissive: 0x0a2a36, emissiveIntensity: 0.6, side: THREE.DoubleSide }),
    accent: new THREE.MeshStandardMaterial({ color: 0x22d3ee, roughness: 0.4, emissive: 0x22d3ee, emissiveIntensity: 0.9 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0b1a2a, roughness: 0.1, metalness: 0.6, emissive: 0x0e3a4a, emissiveIntensity: 0.6 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1b2230, roughness: 0.7, metalness: 0.2 }),
  };
}

function kit(g) {
  const M = mats();
  const add = (geo, mat, p, r = [0, 0, 0], s = [1, 1, 1]) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(...p); m.rotation.set(...r); m.scale.set(...s); g.add(m); return m;
  };
  /** fuselage from [radius, x] profile (tail→nose), squashed width/height */
  const fuselage = (prof, { segs = 14, w = 0.82, h = 1, y = 0 } = {}) =>
    add(new THREE.LatheGeometry(prof.map(([r, x]) => new THREE.Vector2(r, x)), segs), M.body, [0, y, 0], [0, 0, -Math.PI / 2], [1, h, w]);
  /** one wing half: root chord (xLE,xTE) → tip chord at span, with dihedral (rad) */
  const wing = (side, { rootLE, rootTE, tipLE, tipTE, span, y, dihedral = 0.07, t = 0.1, root = 0 }) => {
    const sh = new THREE.Shape();
    sh.moveTo(rootLE, root * side); sh.lineTo(tipLE, span * side); sh.lineTo(tipTE, span * side); sh.lineTo(rootTE, root * side); sh.closePath();
    const m = add(new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false }), M.body, [0, y, 0]);
    m.rotation.x = Math.PI / 2 - side * dihedral;
    return m;
  };
  /** vertical fin from XY polygon */
  const fin = (pts, y = 0) => {
    const sh = new THREE.Shape(); sh.moveTo(...pts[0]); pts.slice(1).forEach((p) => sh.lineTo(...p)); sh.closePath();
    return add(new THREE.ExtrudeGeometry(sh, { depth: 0.09, bevelEnabled: false }), M.body, [0, y, -0.045]);
  };
  /** horizontal stab: rectangle-ish planform (both sides) at x center, y */
  const stab = (x, y, span, rootC, tipC, mat = M.body) => {
    const sh = new THREE.Shape();
    sh.moveTo(x + rootC / 2, 0); sh.lineTo(x + tipC / 2 - 0.15, span); sh.lineTo(x - tipC / 2 - 0.15, span); sh.lineTo(x - rootC / 2, 0);
    sh.lineTo(x - tipC / 2 - 0.15, -span); sh.lineTo(x + tipC / 2 - 0.15, -span); sh.closePath();
    return add(new THREE.ExtrudeGeometry(sh, { depth: 0.07, bevelEnabled: false }), mat, [0, y, 0], [Math.PI / 2, 0, 0]);
  };
  const rod = (a, b, r = 0.05, mat = M.body) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const len = A.distanceTo(B);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), mat);
    m.position.copy(A).add(B).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
    g.add(m); return m;
  };
  const wheel = (p, pant = false) => {
    add(new THREE.CylinderGeometry(0.28, 0.28, 0.16, 12), M.dark, p, [Math.PI / 2, 0, 0]);
    if (pant) add(new THREE.SphereGeometry(0.34, 12, 8), M.body, [p[0], p[1] + 0.05, p[2]], [0, 0, 0], [1.9, 0.95, 0.7]);
  };
  /** tricycle gear: mains at x=mx, ±mz; nose at nx. ground y gy. */
  const gear = ({ mx, mz, nx, gy, attachY, pant = false, spring = false }) => {
    for (const s of [1, -1]) {
      rod([mx + 0.1, attachY, spring ? 0.45 * s : mz * 0.7 * s], [mx, gy, mz * s], spring ? 0.06 : 0.07);
      wheel([mx, gy, mz * s], pant);
    }
    rod([nx, attachY, 0], [nx - 0.05, gy, 0], 0.06);
    wheel([nx - 0.05, gy, 0], pant);
  };
  const prop = (x, y = 0, r = 1.0) => {
    add(new THREE.ConeGeometry(0.18, 0.4, 10), M.dark, [x + 0.15, y, 0], [0, 0, -Math.PI / 2]);
    add(new THREE.CircleGeometry(r, 24), new THREE.MeshBasicMaterial({ color: 0xbff6ff, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }),
      [x, y, 0], [0, Math.PI / 2, 0]);
  };
  const lights = (tipL, tipR, tail) => {
    const mk = (color, p, size) => {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color }));
      s.position.set(...p); g.add(s);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.scale.setScalar(size); halo.position.set(...p); g.add(halo);
      return halo;
    };
    mk(0xff3344, tipL, 1.3); mk(0x33ff88, tipR, 1.3);
    g.userData.strobe = mk(0xffffff, tail, 1.4);
  };
  return { M, add, fuselage, wing, fin, stab, rod, wheel, gear, prop, lights };
}

/** Cessna 172/152: high strut-braced wing, boxy cabin w/ windows, conventional tail, spring gear. */
function cessnaHigh(g) {
  const k = kit(g), { M } = k;
  k.fuselage([[0.05, -4.3], [0.18, -4.1], [0.32, -2.6], [0.56, -1.0], [0.72, 0.2], [0.72, 1.1], [0.6, 1.7], [0.42, 2.1], [0, 2.25]], { segs: 8, w: 0.78, h: 1.15, y: 0.05 });
  // cabin box up to wing + windows
  k.add(new THREE.BoxGeometry(2.0, 0.55, 1.12), M.body, [0.3, 0.72, 0]);
  k.add(new THREE.BoxGeometry(0.06, 0.5, 1.0), M.glass, [1.32, 0.66, 0], [0, 0, -0.6]); // windshield
  for (const s of [1, -1]) k.add(new THREE.BoxGeometry(1.5, 0.42, 0.04), M.glass, [0.25, 0.62, 0.57 * s]);
  // high wing on top of cabin (constant chord inboard, slight taper outboard)
  const wy = 1.0;
  for (const s of [1, -1]) {
    k.wing(s, { rootLE: 1.0, rootTE: -0.65, tipLE: 0.85, tipTE: -0.45, span: 5.5, y: wy + 0.1, dihedral: 0.03, t: 0.12 });
    k.rod([0.35, -0.35, 0.55 * s], [0.45, wy - 0.02, 2.7 * s], 0.06); // wing strut
    k.add(new THREE.BoxGeometry(0.55, 0.04, 0.12), M.accent, [0.35, wy + 0.04, 5.45 * s]);
  }
  // tail: swept fin with dorsal, low horizontal stab
  k.fin([[-2.6, 0.45], [-3.9, 1.95], [-4.35, 1.95], [-4.3, 0.2], [-2.0, 0.55]]);
  k.stab(-3.9, 0.12, 1.75, 1.0, 0.65);
  k.add(new THREE.BoxGeometry(4.4, 0.05, 1.18), M.accent, [-0.7, 0.18, 0]);
  k.gear({ mx: -0.15, mz: 1.25, nx: 1.65, gy: -1.05, attachY: -0.45, spring: true });
  k.prop(2.32, 0.05, 0.95);
  k.lights([0.35, wy + 0.1, -5.6], [0.35, wy + 0.1, 5.6], [-4.3, 2.0, 0]);
}

/** PA-28: low "Hershey bar" wing with strong dihedral, cabin w/ windows, swept fin, stabilator. */
function piperLow(g) {
  const k = kit(g), { M } = k;
  k.fuselage([[0.05, -4.2], [0.2, -4.0], [0.34, -2.6], [0.55, -1.0], [0.66, 0.2], [0.64, 1.1], [0.52, 1.8], [0.34, 2.25], [0, 2.4]], { segs: 8, w: 0.82, h: 1.05 });
  k.add(new THREE.BoxGeometry(1.9, 0.42, 1.0), M.body, [0.15, 0.55, 0]);
  k.add(new THREE.BoxGeometry(0.06, 0.42, 0.95), M.glass, [1.1, 0.52, 0], [0, 0, -0.85]);
  for (const s of [1, -1]) k.add(new THREE.BoxGeometry(1.4, 0.32, 0.04), M.glass, [0.05, 0.55, 0.51 * s]);
  for (const s of [1, -1]) {
    k.wing(s, { rootLE: 1.15, rootTE: -0.5, tipLE: 0.95, tipTE: -0.45, span: 5.4, y: -0.3, dihedral: 0.12, t: 0.13 });
    k.add(new THREE.BoxGeometry(0.55, 0.04, 0.12), M.accent, [0.3, -0.3 + 5.3 * 0.12, 5.35 * s]);
  }
  k.fin([[-2.7, 0.35], [-4.0, 1.6], [-4.4, 1.6], [-4.3, 0.15], [-2.1, 0.45]]);
  k.stab(-4.05, 0.02, 1.7, 0.85, 0.85, M.body); // stabilator, straight
  k.add(new THREE.BoxGeometry(4.6, 0.05, 1.08), M.accent, [-0.6, 0.0, 0]);
  k.gear({ mx: 0.0, mz: 1.6, nx: 1.75, gy: -1.0, attachY: -0.35 });
  k.prop(2.45, 0, 0.95);
  const ty = -0.3 + 5.5 * 0.12;
  k.lights([0.3, ty, -5.55], [0.3, ty, 5.55], [-4.35, 1.65, 0]);
}

/** DA40/DA20: slender fuselage, long tapered low wing, T-tail, big bubble canopy, wheel pants. */
function diamondT(g) {
  const k = kit(g), { M } = k;
  k.fuselage([[0, -4.1], [0.16, -4.0], [0.28, -3.0], [0.42, -1.5], [0.6, 0.0], [0.62, 1.0], [0.5, 1.9], [0.25, 2.35], [0, 2.45]], { w: 0.82 });
  k.add(new THREE.SphereGeometry(0.62, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.glass, [0.35, 0.32, 0], [0, 0, 0], [2.0, 0.85, 0.95]);
  for (const s of [1, -1]) {
    k.wing(s, { rootLE: 0.95, rootTE: -0.75, tipLE: 0.55, tipTE: -0.05, span: 5.9, y: -0.38, dihedral: 0.07, t: 0.09 });
    k.add(new THREE.BoxGeometry(0.6, 0.05, 0.12), M.accent, [0.25, 0, 5.85 * s]);
  }
  k.fin([[-2.6, 0], [-4.0, 1.65], [-3.4, 1.65], [-1.6, 0]], 0.15);
  k.add(new THREE.BoxGeometry(0.75, 0.06, 3.3), M.body, [-3.75, 1.8, 0]);
  for (const s of [1, -1]) k.add(new THREE.BoxGeometry(0.75, 0.065, 0.1), M.accent, [-3.75, 1.8, 1.62 * s]);
  k.add(new THREE.BoxGeometry(5.2, 0.06, 1.06), M.accent, [-0.6, -0.05, 0]);
  k.gear({ mx: -0.1, mz: 1.45, nx: 1.7, gy: -0.95, attachY: -0.4, pant: true });
  k.prop(2.5, 0, 1.0);
  k.lights([0.3, 0, -6.0], [0.3, 0, 6.0], [-4.1, 1.85, 0]);
}

/** SR20: stout fuselage, tapered low wing, tall conventional tail w/ low stab, big cabin glass, pants. */
function cirrusLow(g) {
  const k = kit(g), { M } = k;
  k.fuselage([[0.04, -4.3], [0.16, -4.15], [0.3, -3.0], [0.55, -1.2], [0.74, 0.1], [0.74, 1.0], [0.6, 1.8], [0.36, 2.4], [0, 2.6]], { w: 0.85, h: 1.05 });
  k.add(new THREE.SphereGeometry(0.66, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.glass, [0.25, 0.4, 0], [0, 0, 0], [1.9, 0.8, 1.0]);
  for (const s of [1, -1]) {
    k.wing(s, { rootLE: 1.2, rootTE: -0.6, tipLE: 0.65, tipTE: -0.2, span: 5.85, y: -0.42, dihedral: 0.09, t: 0.12 });
    k.add(new THREE.BoxGeometry(0.55, 0.05, 0.12), M.accent, [0.25, -0.42 + 5.8 * 0.09, 5.8 * s]);
  }
  k.fin([[-2.5, 0.35], [-3.85, 1.9], [-4.4, 1.9], [-4.35, 0.15], [-2.0, 0.45]]);
  k.stab(-3.95, 0.12, 2.0, 1.05, 0.6);
  k.add(new THREE.BoxGeometry(4.8, 0.05, 1.22), M.accent, [-0.5, 0.05, 0]);
  k.gear({ mx: 0.0, mz: 1.6, nx: 1.9, gy: -1.0, attachY: -0.45, pant: true });
  k.prop(2.65, 0, 1.0);
  const ty = -0.42 + 5.9 * 0.09;
  k.lights([0.3, ty, -6.0], [0.3, ty, 6.0], [-4.35, 1.95, 0]);
}

/** Other: neutral generic low-wing single. */
function genericLow(g) {
  const k = kit(g), { M } = k;
  k.fuselage([[0.05, -4.0], [0.2, -3.8], [0.34, -2.5], [0.55, -1.0], [0.64, 0.2], [0.62, 1.1], [0.48, 1.8], [0.3, 2.2], [0, 2.35]], { segs: 10, w: 0.85 });
  k.add(new THREE.SphereGeometry(0.55, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.glass, [0.3, 0.35, 0], [0, 0, 0], [1.6, 0.8, 0.95]);
  for (const s of [1, -1]) {
    k.wing(s, { rootLE: 1.0, rootTE: -0.55, tipLE: 0.8, tipTE: -0.3, span: 5.3, y: -0.3, dihedral: 0.08, t: 0.11 });
    k.add(new THREE.BoxGeometry(0.55, 0.05, 0.12), M.accent, [0.3, -0.3 + 5.3 * 0.08, 5.25 * s]);
  }
  k.fin([[-2.5, 0.3], [-3.7, 1.55], [-4.15, 1.55], [-4.1, 0.15], [-2.0, 0.4]]);
  k.stab(-3.8, 0.1, 1.6, 0.85, 0.6);
  k.add(new THREE.BoxGeometry(4.4, 0.05, 1.08), M.accent, [-0.6, 0.0, 0]);
  k.gear({ mx: 0.0, mz: 1.5, nx: 1.7, gy: -0.95, attachY: -0.35 });
  k.prop(2.4, 0, 0.95);
  const ty = -0.3 + 5.4 * 0.08;
  k.lights([0.3, ty, -5.45], [0.3, ty, 5.45], [-4.1, 1.6, 0]);
}

const BUILDERS = { 'cessna-high': cessnaHigh, 'piper-low': piperLow, 'diamond-t': diamondT, 'cirrus-low': cirrusLow, 'generic-low': genericLow };

/** Build a model for a type id. style 'solid' (replay) or 'wire' (cyan holographic hero). */
export function buildAircraft(type, { style = 'solid' } = {}) {
  const info = aircraftModelFor(type);
  const inner = new THREE.Group();
  (BUILDERS[info.family] || genericLow)(inner);
  inner.scale.setScalar(info.scale);
  const g = new THREE.Group();
  g.add(inner);
  g.userData = { ...inner.userData, type: info.id, family: info.family, label: info.label };
  if (style === 'wire') toWire(inner);
  return g;
}

function toWire(root) {
  const CYAN = 0x22d3ee;
  const meshes = [];
  root.traverse((o) => { if (o.isMesh && !o.material.isMeshBasicMaterial) meshes.push(o); });
  for (const m of meshes) {
    m.material = new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.24, depthWrite: false, side: THREE.DoubleSide });
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 20),
      new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
    e.position.copy(m.position); e.rotation.copy(m.rotation); e.scale.copy(m.scale); e.quaternion.copy(m.quaternion);
    m.parent.add(e);
  }
}
