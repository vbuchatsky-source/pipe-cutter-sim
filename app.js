import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const $ = id => document.getElementById(id);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => { t = clamp(t); return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
const TAU = Math.PI * 2;
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); };

// ---------- layout ----------
const MQ = matchMedia('(max-width: 820px), (max-height: 520px)');
function layout() { const m = MQ.matches; document.body.classList.toggle('mobile', m); document.body.classList.toggle('landscape', m && innerWidth > innerHeight); return m; }
let IS_MOBILE = layout();

// ---------- renderer ----------
const canvas = $('c');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true }); }
catch (e) { document.body.insertAdjacentHTML('beforeend', '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;background:#1b1e23;z-index:99">WebGL לא זמין בדפדפן הזה. נסה Chrome או Safari.</div>'); throw e; }
renderer.setPixelRatio(Math.min(devicePixelRatio, IS_MOBILE ? 1.75 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x15181d);
scene.fog = new THREE.Fog(0x1b1e23, 4500, 9000);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
const camera = new THREE.PerspectiveCamera(34, 1, 20, 16000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
controls.maxPolarAngle = Math.PI * 0.53;
scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a2622, 0.55));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(400, 2600, 1300); sun.target.position.set(-300, 900, 0); scene.add(sun.target);
sun.castShadow = true; sun.shadow.mapSize.set(IS_MOBILE ? 1024 : 4096, IS_MOBILE ? 1024 : 4096); sun.shadow.radius = 4; sun.shadow.normalBias = 1.5;
Object.assign(sun.shadow.camera, { left: -1300, right: 1300, top: 1100, bottom: -1100, near: 200, far: 5000 });
sun.shadow.bias = -0.0005; scene.add(sun);
const fill = new THREE.DirectionalLight(0xbfd4ff, 0.6); fill.position.set(-1500, 1500, -1200); scene.add(fill);
const stripe = new THREE.Mesh(new THREE.PlaneGeometry(2300, 30), new THREE.MeshStandardMaterial({ color: 0xf2c11d, roughness: .7 }));
stripe.rotation.x = -Math.PI / 2; stripe.position.set(-430, 2, 520); scene.add(stripe);

// ---------- materials ----------
const std = (c, m, r, o = {}) => Object.assign(new THREE.MeshPhysicalMaterial({ color: c, metalness: m, roughness: r, ...o }), { envMapIntensity: 1 });
// ---------- quality ----------
const QP0 = new URLSearchParams(location.search).get('q');
let HIGH = QP0 ? QP0 === 'high' : (localStorage.getItem('pcs_q') ? localStorage.getItem('pcs_q') === 'high' : !IS_MOBILE && (navigator.hardwareConcurrency || 8) > 4);
// ---------- procedural textures ----------
function canvasTex(w, h, draw, rep = [1, 1], srgb = false) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.userData.canvas = c; return t; }
function normalFrom(tex, k = 2) { const s = tex.userData.canvas, w = s.width, h = s.height; const d = s.getContext('2d').getImageData(0, 0, w, h).data; const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); const o = x.createImageData(w, h);
  const L = (i, j) => d[(((j + h) % h) * w + ((i + w) % w)) * 4] / 255;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const dx = (L(i + 1, j) - L(i - 1, j)) * k, dy = (L(i, j + 1) - L(i, j - 1)) * k; const n = 1 / Math.hypot(dx, dy, 1); const p = (j * w + i) * 4; o.data[p] = (-dx * n * .5 + .5) * 255; o.data[p + 1] = (dy * n * .5 + .5) * 255; o.data[p + 2] = n * 255; o.data[p + 3] = 255; }
  x.putImageData(o, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.copy(tex.repeat); t.anisotropy = 8; return t; }
const brushed = canvasTex(512, 512, (x, w, h) => { x.fillStyle = '#808080'; x.fillRect(0, 0, w, h); for (let i = 0; i < 5000; i++) { const y = Math.random() * h, v = 90 + Math.random() * 90 | 0; x.strokeStyle = `rgba(${v},${v},${v},.30)`; x.lineWidth = .4 + Math.random(); x.beginPath(); const sx = Math.random() * w; x.moveTo(sx - 200, y); x.lineTo(sx + 200, y); x.stroke(); } }, [3, 3]);
const brushedN = normalFrom(brushed, 1.2);
const paint = canvasTex(256, 256, (x, w, h) => { x.fillStyle = '#7a7a7a'; x.fillRect(0, 0, w, h); for (let i = 0; i < 9000; i++) { const v = 100 + Math.random() * 60 | 0; x.fillStyle = `rgba(${v},${v},${v},.5)`; x.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); } }, [4, 4]);
const paintN = normalFrom(paint, .6);
const concrete = canvasTex(1024, 1024, (x, w, h) => { x.fillStyle = '#6a6a6a'; x.fillRect(0, 0, w, h); for (let i = 0; i < 260; i++) { const g = x.createRadialGradient(0, 0, 0, 0, 0, 60 + Math.random() * 120); const v = 70 + Math.random() * 90 | 0; g.addColorStop(0, `rgba(${v},${v},${v},.25)`); g.addColorStop(1, 'rgba(0,0,0,0)'); x.save(); x.translate(Math.random() * w, Math.random() * h); x.fillStyle = g; x.fillRect(-200, -200, 400, 400); x.restore(); } x.strokeStyle = 'rgba(20,20,20,.9)'; x.lineWidth = 3; x.strokeRect(0, 0, w, h); }, [10, 10]);
const floorCol = canvasTex(1024, 1024, (x, w, h) => { x.fillStyle = '#3a3f47'; x.fillRect(0, 0, w, h); for (let i = 0; i < 3000; i++) { const v = 50 + Math.random() * 30 | 0; x.fillStyle = `rgba(${v},${v + 4},${v + 10},.35)`; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); } x.strokeStyle = 'rgba(15,17,20,.95)'; x.lineWidth = 4; x.strokeRect(0, 0, w, h); }, [14, 14], true);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000), new THREE.MeshPhysicalMaterial({ map: floorCol, roughnessMap: concrete, roughness: .55, metalness: 0, clearcoat: .6, clearcoatRoughness: .18, envMapIntensity: .55 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

// safety floor marking
const phys = (o) => Object.assign(new THREE.MeshPhysicalMaterial(o), { envMapIntensity: o.env ?? 1 });
const M = {
  frame: phys({ color: 0x3d4552, metalness: .3, roughness: .55, roughnessMap: paint, normalMap: paintN, normalScale: new THREE.Vector2(.25, .25), clearcoat: .55, clearcoatRoughness: .35 }),
  frameDk: phys({ color: 0x272c34, metalness: .3, roughness: .6, roughnessMap: paint, normalMap: paintN, normalScale: new THREE.Vector2(.25, .25), clearcoat: .4, clearcoatRoughness: .4 }),
  alu: phys({ color: 0xc9cfd7, metalness: 1, roughness: .34, roughnessMap: brushed, normalMap: brushedN, normalScale: new THREE.Vector2(.18, .18) }),
  steel: phys({ color: 0xe4e8ec, metalness: 1, roughness: .2, roughnessMap: brushed, normalMap: brushedN, normalScale: new THREE.Vector2(.12, .12) }),
  black: phys({ color: 0x1b1e23, metalness: .55, roughness: .42, roughnessMap: brushed, clearcoat: .25 }),
  rubber: phys({ color: 0x121316, metalness: 0, roughness: .95 }),
  yellow: phys({ color: 0xf2b51a, metalness: .1, roughness: .45, roughnessMap: paint, clearcoat: .7, clearcoatRoughness: .25 }),
  orange: phys({ color: 0xe2601a, metalness: .1, roughness: .45, roughnessMap: paint, clearcoat: .7, clearcoatRoughness: .25 }),
  blue: phys({ color: 0x2556a8, metalness: .6, roughness: .35, clearcoat: .5 }),
  green: phys({ color: 0x2f9f5a, metalness: .2, roughness: .4, clearcoat: .6 }),
  red: phys({ color: 0xd0201a, metalness: .1, roughness: .35, clearcoat: .9, clearcoatRoughness: .1 }),
  white: phys({ color: 0xe9ebee, metalness: .05, roughness: .5, roughnessMap: paint, clearcoat: .5 }),
  carbide: phys({ color: 0x6c7078, metalness: 1, roughness: .28 }),
  brass: phys({ color: 0xd2a84e, metalness: 1, roughness: .28 }),
  hose: phys({ color: 0x1f6fe0, metalness: 0, roughness: .35, clearcoat: .6 }),
  cable: phys({ color: 0xe0601a, metalness: 0, roughness: .55 }),
  cableBk: phys({ color: 0x16181b, metalness: 0, roughness: .6 }),
  glass: HIGH ? new THREE.MeshPhysicalMaterial({ color: 0xffa060, metalness: 0, roughness: .06, transmission: .92, thickness: 4, ior: 1.58, attenuationColor: new THREE.Color(0xff7010), attenuationDistance: 60, transparent: true, opacity: 1, side: THREE.DoubleSide, specularIntensity: 1 })
    : new THREE.MeshPhysicalMaterial({ color: 0xff7a1a, metalness: 0, roughness: .08, transparent: true, opacity: .16, depthWrite: false, side: THREE.DoubleSide }),
  glassClear: new THREE.MeshPhysicalMaterial({ color: 0xbfe6ff, metalness: 0, roughness: .05, transparent: true, opacity: .14, depthWrite: false, side: THREE.DoubleSide }),
  screen: phys({ color: 0x0e2a3f, metalness: .2, roughness: .3, emissive: new THREE.Color(0x2c8fd6), emissiveIntensity: .7 }),
};
const MATS = {
  steel: { n: 'פלדה (St37 / מגולוון)', c: 0xa9afb6, m: 1, r: .32, cut: 1.0, laser: 'לייזר פייבר 20–30W (חריטה/השחרה)' },
  ss: { n: 'נירוסטה 304/316', c: 0xd6dade, m: 1, r: .2, cut: 1.35, laser: 'לייזר פייבר MOPA 30W – סימון שחור ללא פגיעה בשכבת הפסיבציה' },
  al: { n: 'אלומיניום 6063', c: 0xcdd3da, m: .9, r: .38, cut: .7, laser: 'לייזר פייבר 20W (אנודייז: סימון לבן מצוין)' },
  cu: { n: 'נחושת', c: 0xc77d4e, m: 1, r: .28, cut: .8, laser: 'MOPA 60W או לייזר ירוק 532nm (נחושת מחזירה אינפרא-אדום)' },
  pvc: { n: 'PVC / פלסטיק', c: 0xe7e9ec, m: 0, r: .55, cut: .45, laser: '⚠ לא לייזר CO₂/פייבר – משחרר HCl! להשתמש בהזרקת דיו UV-מתייבש או גלגלת הטבעה חמה' },
};

// ---------- geometry helpers ----------
function add(mesh, parent) { mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh; }
const GC = new Map();
function rgeo(w, h, d) { const k = w + '|' + h + '|' + d; if (!GC.has(k)) { const r = Math.min(3.5, Math.min(w, h, d) * .14); GC.set(k, r < .6 ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, 2, r)); } return GC.get(k); }
function box(w, h, d, mat, x, y, z, p) { const m = add(new THREE.Mesh(rgeo(w, h, d), mat.clone()), p); m.position.set(x, y, z); return m; }
function cyl(r, len, mat, axis, x, y, z, p, seg = 40, r2) {
  const rt = r2 ?? r, c = Math.min(1.6, r * .12, len * .12); const pts = [[0, -len / 2], [r - c, -len / 2], [r, -len / 2 + c], [rt, len / 2 - c], [rt - c, len / 2], [0, len / 2]].map(a => new THREE.Vector2(Math.max(0.001, a[0]), a[1]));
  const g = c > .3 ? new THREE.LatheGeometry(pts, seg) : new THREE.CylinderGeometry(rt, r, len, seg);
  if (axis === 'x') g.rotateZ(-Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2);
  const m = add(new THREE.Mesh(g, mat.clone()), p); m.position.set(x, y, z); return m;
}
function rbox(w, h, d, r, mat, x, y, z, p) { // rounded box via extrude
  const s = new THREE.Shape(); const hw = w / 2 - r, hh = h / 2 - r;
  s.absarc(hw, hh, r, 0, Math.PI / 2); s.absarc(-hw, hh, r, Math.PI / 2, Math.PI); s.absarc(-hw, -hh, r, Math.PI, 1.5 * Math.PI); s.absarc(hw, -hh, r, 1.5 * Math.PI, TAU);
  const g = new THREE.ExtrudeGeometry(s, { depth: d - 2, bevelEnabled: true, bevelSize: 1, bevelThickness: 1, curveSegments: 6 }); g.translate(0, 0, -(d - 2) / 2);
  const m = add(new THREE.Mesh(g, mat.clone()), p); m.position.set(x, y, z); return m;
}

// ---------- parts registry ----------
const Y0 = 1000; // pipe axis height (mm)
const parts = {}; const partOrder = [];
function part(id, name, desc, dir, anchor, opt = {}) {
  const g = new THREE.Group(); g.userData.part = id; scene.add(g);
  parts[id] = { id, name, desc, g, dir: new THREE.Vector3(...dir), base: new THREE.Vector3(), anchor: new THREE.Vector3(...anchor), shell: !!opt.shell, no: partOrder.length + 1 };
  partOrder.push(id); return g;
}

// ---- frame / base ----
const gFrame = part('frame', 'שלדת מכונה מרותכת', 'שלדת פלדה ממולאת (פולימר-בטון) – בולמת רעידות', [0, -350, 0], [-1150, -70, 210], { shell: true });
const TT = Y0 - 110; // table top
box(1700, 24, 460, M.frame, -520, TT - 12, 0, gFrame);
box(480, 24, 460, M.frame, 470, TT - 150, -0, gFrame).position.y = TT - 400; // lower outfeed shelf
for (const x of [-1350, 310, -520]) for (const z of [-205, 205]) box(60, TT - 24, 60, M.frameDk, x, (TT - 24) / 2, z, gFrame);
for (const z of [-205, 205]) { box(1720, 60, 50, M.frameDk, -520, 140, z, gFrame); box(40, TT - 30, 40, M.frameDk, 690, (TT - 30) / 2, z, gFrame); }
box(380, 40, 460, M.frameDk, 500, TT - 20, 0, gFrame).visible = false;
for (const z of [-205, 205]) box(420, 40, 40, M.frameDk, 500, TT - 20, z, gFrame);
// leveling feet
for (const x of [-1350, 310, 690]) for (const z of [-205, 205]) cyl(30, 20, M.rubber, 'y', x, 10, z, gFrame);
// lower cabinet panel
box(1640, 520, 6, M.frame, -540, 470, 228, gFrame); box(1640, 520, 6, M.frame, -540, 470, -228, gFrame);
// electrical cabinet
const gCab = part('cab', 'ארון חשמל + PLC + דרייברים', 'PLC בטיחותי, דרייבר סרוו, ספק כוח, מגעני בטיחות', [0, -150, -400], [-900, 320, -230]);
rbox(500, 420, 200, 8, M.frame, -900, 470, -340, gCab); box(10, 300, 6, M.steel, -690, 480, -238, gCab);

// ---- infeed V-rollers ----
const gIn = part('infeed', 'רולרי V בהזנה', 'מרכזים את הצינור בכל קוטר, עם בדיקת ישרות', [0, 160, 0], [-650, 70, 0]);
const vRollers = [];
for (const x of [-1250, -900, -560]) {
  const st = new THREE.Group(); st.position.set(x, 0, 0); gIn.add(st);
  box(60, 70, 120, M.frameDk, 0, TT + 35, 0, st);
  const vr = new THREE.Group(); st.add(vr); vRollers.push(vr);
  for (const s of [-1, 1]) { const c = cyl(8, 40, M.alu, 'z', 0, 0, s * 22, vr, 32, 28); if (s < 0) c.rotation.x = Math.PI; c.material.color.set(0xd85a1c); }
  cyl(4, 90, M.steel, 'z', 0, 0, 0, vr);
  box(14, 60, 14, M.frameDk, 0, -30, -40, vr); box(14, 60, 14, M.frameDk, 0, -30, 40, vr);
}

// ---- servo feeder (bar pusher with internal collet) ----
const gFeed = part('feeder', 'מזין סרוו + מצמד פנימי', 'מוט דוחף עם קולט מתרחב בתוך הצינור – אפס החלקה', [0, 0, -260], [-700, 140, -130]);
const RAIL_Z = -150;
box(1500, 40, 60, M.alu, -700, Y0 - 40, RAIL_Z, gFeed);
for (let x = -1430; x <= 30; x += 100) box(6, 8, 62, M.frameDk, x, Y0 - 18, RAIL_Z, gFeed);
cyl(8, 1440, M.steel, 'x', -700, Y0 + 2, RAIL_Z, gFeed); // ball screw
for (const x of [-1450, 50]) box(30, 70, 60, M.frameDk, x, Y0 - 5, RAIL_Z, gFeed);
const motor = new THREE.Group(); motor.position.set(-1530, Y0, RAIL_Z); gFeed.add(motor);
box(120, 80, 80, M.black, 0, 0, 0, motor); cyl(34, 30, M.blue, 'x', -72, 0, 0, motor); box(6, 82, 82, M.alu, 62, 0, 0, motor);
const carriage = new THREE.Group(); gFeed.add(carriage);
box(80, 40, 80, M.alu, 0, Y0 + 15, RAIL_Z, carriage);
box(40, 24, 150, M.orange, -10, Y0 + 10, RAIL_Z / 2 - 3, carriage);
const pusher = cyl(14, 60, M.steel, 'x', -30, Y0, 0, carriage); // pusher head body
const colletTip = cyl(5, 22, M.brass, 'x', 8, Y0, 0, carriage);

// ---- measuring wheel ----
const gWheel = part('wheel', 'גלגל מדידה + מקודד (על החומר)', 'מקודד שני על הצינור עצמו – מזהה החלקה', [0, 220, 0], [-70, 100, 0]);
const wheelArm = new THREE.Group(); wheelArm.position.set(-70, 0, 0); gWheel.add(wheelArm);
const wheel = cyl(22, 14, M.rubber, 'z', 0, 0, 0, wheelArm, 40); cyl(10, 16, M.alu, 'z', 0, 0, 0, wheelArm);
const encBody = cyl(14, 26, M.blue, 'z', 0, 0, 26, wheelArm);
box(80, 10, 10, M.alu, -40, 18, 18, wheelArm);
const wheelSpokes = new THREE.Group(); wheelArm.add(wheelSpokes); for (let i = 0; i < 3; i++) { const b = box(3, 36, 2, M.steel, 0, 0, 8, wheelSpokes); b.rotation.z = i * Math.PI / 3; }

// ---- clamps (pneumatic V-jaws both sides of the cut) ----
function makeClamp(id, name, x, w) {
  const g = part(id, name, 'מלחציים פנאומטיים עם לסתות V ופוליאוריתן – תפיסה ב-3 נקודות', [0, 0, 0], [x, 110, 0]);
  box(w + 30, Y0 - TT - 40, 140, M.frameDk, x, TT + (Y0 - TT - 40) / 2, 0, g);
  const jaws = [];
  for (const s of [-1, 1]) {
    const j = new THREE.Group(); g.add(j); j.userData.s = s;
    box(w, 44, 30, M.steel, x, Y0, 0, j); box(w, 44, 4, M.rubber, x, Y0, -s * 15, j).material.color.set(0x5aa0d0);
    cyl(16, 70, M.alu, 'z', x, Y0, s * 50, j); cyl(5, 30, M.steel, 'z', x, Y0, s * 20, j);
    jaws.push(j);
  }
  return { g, jaws };
}
const clampA = makeClamp('clampA', 'מלחציים A (לפני החיתוך)', -24, 30);
const clampB = makeClamp('clampB', 'מלחציים B (על החתיכה)', 55, 40);
parts.clampA.dir.set(0, 0, 0); parts.clampB.dir.set(0, 0, 0);
clampA.jaws.forEach(j => j.userData.ex = 1); clampB.jaws.forEach(j => j.userData.ex = 1);
// under-support V block for piece
const gSup = part('support', 'תומך V תחתון + מגש נפילה', 'תמיכה תחתונה לחתיכה – מונע כיפוף ורעד בזמן הסימון', [0, -200, 0], [55, -40, 60]);
const supV = new THREE.Group(); supV.position.set(55, 0, 0); gSup.add(supV);
box(80, 12, 60, M.frameDk, 0, -30, 0, supV);

// ---- chamfer / rounding head ----
const gCh = part('chamfer', 'ראש עיגול קצה (Form tool מסתובב)', 'ראש סיבובי שעוטף את קצה הצינור ומעגל ברדיוס R', [300, 0, 0], [270, 120, 0]);
const chSlide = new THREE.Group(); gCh.add(chSlide);
box(320, 30, 120, M.alu, 330, TT + 15, 0, gCh);
box(160, 110, 110, M.frame, 300, Y0, 0, chSlide);
box(80, 80, 80, M.black, 420, Y0, 0, chSlide);
const chSpin = new THREE.Group(); chSpin.position.set(205, Y0, 0); chSlide.add(chSpin);
cyl(44, 30, M.steel, 'x', 0, 0, 0, chSpin, 48);
const chInserts = []; for (let i = 0; i < 3; i++) { const a = i * TAU / 3; const b = box(14, 8, 8, M.yellow, -20, Math.cos(a) * 26, Math.sin(a) * 26, chSpin); b.rotation.x = a; chInserts.push(b); }
cyl(30, 10, M.carbide, 'x', -18, 0, 0, chSpin, 48, 34);

// ---- laser marker + enclosure ----
const gLaser = part('laser', 'ראש לייזר פייבר (Galvo) + עדשת F-theta', 'מסמן קווי סרגל 1/5/10 ממ בלי מגע ובלי כוח על הצינור', [0, 350, 0], [55, 260, 0]);
box(120, 110, 140, M.black, 55, Y0 + 230, -10, gLaser); box(120, 6, 140, M.orange, 55, Y0 + 288, -10, gLaser);
cyl(30, 40, M.steel, 'y', 55, Y0 + 160, 0, gLaser); cyl(32, 6, M.black, 'y', 55, Y0 + 140, 0, gLaser);
box(30, 300, 30, M.alu, 55, Y0 + 150, -170, gLaser); box(30, 30, 160, M.alu, 55, Y0 + 285, -90, gLaser);
const gSrc = part('source', 'מקור לייזר פייבר + צינור יניקת עשן', 'מקור 20–30W, מסנן HEPA+פחם פעיל', [0, 0, -300], [150, 420, -160]);
rbox(220, 90, 160, 6, M.white, 160, TT + 360, -170, gSrc);
const duct = cyl(25, 300, M.alu, 'y', -10, Y0 + 300, 80, gSrc, 24); cyl(25, 200, M.alu, 'x', 80, Y0 + 450, 80, gSrc, 24);
const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1, 8), new THREE.MeshBasicMaterial({ color: 0x77ff88, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, toneMapped: false }));
beam.visible = false; scene.add(beam);
const spot = new THREE.PointLight(0x66ff77, 0, 160); scene.add(spot);
const glowTex = canvasTex(128, 128, (x, w) => { const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.2, 'rgba(160,255,170,.8)'); g.addColorStop(1, 'rgba(0,255,60,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); }, [1, 1], true);
const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); glow.scale.set(26, 26, 1); glow.visible = false; scene.add(glow);
const sparkGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffa040, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); sparkGlow.scale.set(60, 60, 1); sparkGlow.visible = false; scene.add(sparkGlow);
const gEncl = part('encl', 'מארז לייזר Class-1 עם חלון סינון', 'חלון פוליקרבונט OD6+ @1064nm, דלת עם Interlock', [0, 300, 300], [55, 330, 120], { shell: true });
{ const ex = 55, w = 230, h = 320, d = 260, y = Y0 + 90;
  for (const [ww, hh, dd, xx, yy, zz] of [[w, h, 2, ex, y, d / 2], [w, h, 2, ex, y, -d / 2], [w, 2, d, ex, y + h / 2, 0]]) {
    const m = add(new THREE.Mesh(new THREE.BoxGeometry(ww, hh, dd), M.glass.clone()), gEncl); m.position.set(xx, yy, zz); m.castShadow = false; }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) profile(h, 'y', ex + sx * w / 2, y, sz * d / 2, gEncl, 20);
  for (const sz of [-1, 1]) profile(w, 'x', ex, y + h / 2, sz * d / 2, gEncl, 20);
  for (const sx of [-1, 1]) profile(d, 'z', ex + sx * w / 2, y + h / 2, 0, gEncl, 20);
  box(30, 20, 14, M.yellow, ex + w / 2 - 20, y + h / 2 - 20, d / 2 + 8, gEncl); // interlock
}

// ---- cut-off ----
const gSaw = part('saw', 'יחידת חיתוך', 'חותך אורביטלי / מסור – נע מטה בציר סרוו', [0, 350, -250], [0, 280, -60]);
const sawArm = new THREE.Group(); gSaw.add(sawArm);
box(60, 320, 60, M.frame, 0, Y0 + 70, -230, gSaw);
const sawHead = new THREE.Group(); sawArm.add(sawHead);
box(70, 70, 220, M.orange, 0, 0, -130, sawHead);
box(90, 90, 100, M.black, 0, 0, -260, sawHead);
const blade = new THREE.Group(); sawHead.add(blade);
const bladeDisk = cyl(70, 2, M.steel, 'x', 0, 0, 0, blade, 72);
for (let i = 0; i < 36; i++) { const a = i * TAU / 36; const t = box(3, 6, 4, M.carbide, 0, Math.cos(a) * 71, Math.sin(a) * 71, blade); t.rotation.x = -a; }
cyl(18, 10, M.black, 'x', 0, 0, 0, blade);
const guard = add(new THREE.Mesh(new THREE.CylinderGeometry(78, 78, 16, 40, 1, true, Math.PI * .1, Math.PI * .9), M.orange.clone()), sawHead);
guard.geometry.rotateZ(-Math.PI / 2); guard.material.side = THREE.DoubleSide;
const chips = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: 0xffb24a, size: 5, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
chips.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(60 * 3), 3)); chips.visible = false; scene.add(chips);
const chipV = []; for (let i = 0; i < 60; i++) chipV.push(new THREE.Vector3());

// ---- outfeed chute, gauge, sorter, bins ----
const gChute = part('chute', 'מסילת יציאה משופעת', 'מובילה את החתיכה בעדינות למד האורך', [0, -200, 260], [250, -150, 80]);
const CH0 = new THREE.Vector3(40, Y0 - 120, 0), CH1 = new THREE.Vector3(470, Y0 - 300, 0);
const chLen = CH0.distanceTo(CH1), chAng = Math.atan2(CH1.y - CH0.y, CH1.x - CH0.x);
{ const g = new THREE.Group(); g.position.copy(CH0).add(CH1).multiplyScalar(.5); g.rotation.z = chAng; gChute.add(g);
  box(chLen + 60, 4, 70, M.alu, 0, -26, 0, g); box(chLen + 60, 30, 4, M.alu, 0, -12, 36, g); box(chLen + 60, 30, 4, M.alu, 0, -12, -36, g); }
const gGauge = part('gauge', 'מד אורך לייזרי + מצלמת בדיקה', 'מודד כל חתיכה (±0.02 ממ) ובודק את הסימון במצלמה', [0, 300, 0], [380, 160, 0]);
const GX = 380, GY = CH0.y + (GX - CH0.x) * Math.tan(chAng);
box(20, 160, 20, M.frameDk, GX - 80, GY + 40, -90, gGauge); box(20, 160, 20, M.frameDk, GX + 80, GY + 40, -90, gGauge);
box(200, 20, 20, M.frameDk, GX, GY + 120, -90, gGauge);
box(50, 40, 60, M.blue, GX - 70, GY + 80, -50, gGauge); box(50, 40, 60, M.blue, GX + 70, GY + 80, -50, gGauge);
box(40, 50, 40, M.black, GX, GY + 120, -40, gGauge); cyl(12, 20, M.steel, 'y', GX, GY + 92, -40, gGauge);
const gaugeBeams = [];
for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(.8, .8, 1, 6), new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: .8 })); scene.add(b); b.visible = false; gaugeBeams.push(b); }
const gSort = part('sort', 'מסיט מיון + 3 פחים', 'תקין / פסול / שאריות', [250, -150, 0], [600, -320, 0]);
const BIN_Y = TT - 380, binZ = { ok: -120, scrap: 0, rej: 120 }, BIN_X = 580;
const binCol = { ok: 0x2f9f5a, scrap: 0x707884, rej: 0xc0261e };
for (const k in binZ) { const z = binZ[k]; const c = new THREE.MeshStandardMaterial({ color: binCol[k], metalness: .2, roughness: .6 });
  box(160, 6, 110, c, BIN_X, BIN_Y, z, gSort); box(160, 90, 4, c, BIN_X, BIN_Y + 45, z - 55, gSort); box(160, 90, 4, c, BIN_X, BIN_Y + 45, z + 55, gSort);
  box(4, 90, 110, c, BIN_X - 80, BIN_Y + 45, z, gSort); box(4, 90, 110, c, BIN_X + 80, BIN_Y + 45, z, gSort); }
const flap = new THREE.Group(); flap.position.set(500, CH1.y - 10, 0); gSort.add(flap); box(120, 4, 90, M.steel, 50, 0, 0, flap); cyl(8, 120, M.steel, 'z', 0, 0, 0, flap);

// ---- safety: light curtain, HMI, stack light ----
const gCur = part('curtain', 'וילון אור בטיחות (Type 4)', 'עצירה מיידית אם יד נכנסת לאזור הטעינה', [0, 0, 250], [-650, 420, 300]);
const CZ = 300;
for (const x of [-1300, -100]) { box(36, 420, 36, M.yellow, x, TT + 210, CZ, gCur); box(16, 380, 4, M.black, x + (x < 0 && x < -500 ? 20 : -20), TT + 210, CZ, gCur); }
const curBeams = [];
for (let i = 0; i < 12; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(1180, 1.5, 1.5), new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: .45 })); b.position.set(-700, TT + 40 + i * 30, CZ); gCur.add(b); curBeams.push(b); }
const hand = new THREE.Group(); scene.add(hand); hand.visible = false;
{ const sk = std(0xd9a07a, 0, .7); box(90, 30, 110, sk, 0, 0, 0, hand); for (let i = 0; i < 4; i++) box(18, 18, 70, sk, -30 + i * 20, 0, -80, hand); box(80, 80, 300, std(0x2b4f7d, 0, .8), 0, 0, 200, hand); hand.position.set(-700, TT + 160, CZ + 60); }
const gHmi = part('hmi', 'מסך HMI + עצירת חירום + התנעה בשתי ידיים', 'בחירת מתכון, מונה, התראות', [0, 0, 300], [-1500, 560, 420]);
box(50, 1150, 50, M.frameDk, -1500, 575, 420, gHmi); rbox(300, 210, 50, 10, M.black, -1500, 1250, 420, gHmi);
box(260, 170, 4, M.screen, -1500, 1250, 446, gHmi);
const estopBtn = cyl(28, 22, M.red, 'z', -1360, 1150, 450, gHmi); box(70, 70, 30, M.yellow, -1360, 1150, 430, gHmi);
for (const x of [-1570, -1430]) cyl(16, 14, M.green, 'z', x, 1100, 452, gHmi);
const gTower = part('tower', 'עמוד איתות', 'ירוק=עובד · כתום=המתנה · אדום=תקלה', [0, 250, 0], [690, 650, -205]);
cyl(10, 400, M.alu, 'y', 690, TT + 200, -205, gTower);
const lamps = {};
[['r', 0xff2a2a], ['a', 0xffb020], ['g', 0x30ff70]].forEach(([k, c], i) => { const m = cyl(30, 55, std(c, 0, .3, { emissive: new THREE.Color(c), emissiveIntensity: .05, transparent: true, opacity: .9 }), 'y', 690, TT + 580 - i * 58, -205, gTower); lamps[k] = m; });
// =================== DETAIL PASS ===================
// T-slot aluminium profile
function tslotGeo(len, s = 40) {
  const h = s / 2, k = s / 40; const side = [[-h + 1.5 * k, h], [-4.1 * k, h], [-4.1 * k, h - 4.3 * k], [-8 * k, h - 4.3 * k], [-6 * k, h - 11 * k], [6 * k, h - 11 * k], [8 * k, h - 4.3 * k], [4.1 * k, h - 4.3 * k], [4.1 * k, h], [h - 1.5 * k, h]];
  const sh = new THREE.Shape(); let first = true;
  for (let q = 0; q < 4; q++) for (const [x, y] of side) { let X = x, Y = y; for (let r = 0; r < q; r++) [X, Y] = [Y, -X]; if (first) { sh.moveTo(X, Y); first = false; } else sh.lineTo(X, Y); }
  sh.closePath(); const hole = new THREE.Path(); hole.absarc(0, 0, 4.2 * k, 0, TAU, true); sh.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: true, bevelThickness: .6, bevelSize: .4, bevelSegments: 1, curveSegments: 10 }); g.translate(0, 0, -len / 2); return g;
}
var tsMat;
function profile(len, axis, x, y, z, p, s = 40) { if (!tsMat) { tsMat = M.alu.clone(); tsMat.color.set(0xd5dae0); tsMat.roughness = .42; } const g = tslotGeo(len, s); if (axis === 'x') g.rotateY(Math.PI / 2); else if (axis === 'y') g.rotateX(Math.PI / 2); const m = add(new THREE.Mesh(g, tsMat.clone()), p); m.position.set(x, y, z); return m; }
// socket-head cap screws (instanced per part)
const boltHead = new THREE.CylinderGeometry(4, 4, 4.5, 16); const boltHex = new THREE.CylinderGeometry(2.1, 2.1, 1, 6);
function bolts(p, list, size = 1) { if (!list.length) return; const a = new THREE.InstancedMesh(boltHead, M.black.clone(), list.length), b = new THREE.InstancedMesh(boltHex, new THREE.MeshBasicMaterial({ color: 0x050505 }), list.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(size, size, size);
  list.forEach(([x, y, z, ax = 'y', dir = 1], i) => { const up = new THREE.Vector3(ax === 'x' ? dir : 0, ax === 'y' ? dir : 0, ax === 'z' ? dir : 0); q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    a.setMatrixAt(i, m4.compose(new THREE.Vector3(x, y, z).addScaledVector(up, 2.2 * size), q, s)); b.setMatrixAt(i, m4.compose(new THREE.Vector3(x, y, z).addScaledVector(up, 4.3 * size), q, s)); });
  a.castShadow = true; p.add(a); p.add(b); }
// tube along points
function tube(pts, r, mat, p, seg = 64) { const c = new THREE.CatmullRomCurve3(pts.map(a => new THREE.Vector3(...a))); const m = add(new THREE.Mesh(new THREE.TubeGeometry(c, seg, r, 12, false), mat.clone()), p); return m; }
// label / nameplate
function plate(w, h, draw, x, y, z, p, ry = 0, pxPerMm = 6, emissive = false) { const t = canvasTex(Math.round(w * pxPerMm), Math.round(h * pxPerMm), draw, [1, 1], true); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshPhysicalMaterial({ map: t, metalness: .4, roughness: .35, clearcoat: .6, emissive: emissive ? 0xffffff : 0, emissiveMap: emissive ? t : null, emissiveIntensity: emissive ? .9 : 0 })); m.position.set(x, y, z); m.rotation.y = ry; p.add(m); return m; }
// linear guide rail + carriage blocks
function linRail(len, x, y, z, p, n = 0) { box(len, 15, 15, M.steel, x, y, z, p); const L = []; for (let i = 30; i < len; i += 60) L.push([x - len / 2 + i, y + 7.5, z, 'y']); bolts(p, L, .7); }
function linBlock(x, y, z, p) { box(60, 24, 34, M.steel, x, y, z, p); box(4, 22, 32, M.rubber, x - 31, y, z, p); box(4, 22, 32, M.rubber, x + 31, y, z, p); bolts(p, [[x - 18, y + 12, z - 10], [x + 18, y + 12, z - 10], [x - 18, y + 12, z + 10], [x + 18, y + 12, z + 10]], .7); }
// servo motor with fins + connector
function servo(p, x, y, z, axis = 'x', len = 120, s = 80, col = M.black) { const g = new THREE.Group(); g.position.set(x, y, z); p.add(g); if (axis === 'z') g.rotation.y = Math.PI / 2; if (axis === 'y') g.rotation.z = Math.PI / 2;
  box(len, s, s, col, 0, 0, 0, g); box(14, s + 8, s + 8, M.alu, len / 2 + 7, 0, 0, g); for (let i = -2; i <= 2; i++) box(len - 20, 2, s + 4, col, -4, i * s / 5.2, 0, g);
  box(40, s * .9, s * .9, M.blue, -len / 2 - 20, 0, 0, g); box(22, 18, 30, M.black, -len / 2 + 10, s / 2 + 9, 0, g); cyl(6, 18, M.brass, 'y', -len / 2 + 10, s / 2 + 22, -8, g); cyl(6, 18, M.brass, 'y', -len / 2 + 10, s / 2 + 22, 8, g);
  bolts(g, [[len / 2 + 14, s / 2, s / 2, 'x'], [len / 2 + 14, -s / 2, s / 2, 'x'], [len / 2 + 14, s / 2, -s / 2, 'x'], [len / 2 + 14, -s / 2, -s / 2, 'x']], .8);
  plate(len * .5, s * .32, (c, w, h) => { c.fillStyle = '#d9dde2'; c.fillRect(0, 0, w, h); c.fillStyle = '#123'; c.font = `bold ${h * .42}px Arial`; c.fillText('AC SERVO 400W', w * .05, h * .48); c.font = `${h * .28}px Arial`; c.fillText('3000 rpm · 23-bit ABS', w * .05, h * .85); }, -6, 0, s / 2 + 2.6, g);
  return g; }
// pneumatic cylinder w/ fittings
function pneu(p, x, y, z, len, r, axis = 'z') { const g = new THREE.Group(); g.position.set(x, y, z); p.add(g); if (axis === 'x') g.rotation.y = Math.PI / 2; if (axis === 'y') g.rotation.x = Math.PI / 2;
  box(r * 2.4, r * 2.4, 12, M.alu, 0, 0, -len / 2, g); box(r * 2.4, r * 2.4, 12, M.alu, 0, 0, len / 2, g); cyl(r, len - 12, M.alu, 'z', 0, 0, 0, g, 32);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) cyl(1.6, len, M.steel, 'z', sx * r * .95, sy * r * .95, 0, g, 8);
  for (const zz of [-len / 2, len / 2]) { cyl(3, 8, M.brass, 'y', r * .6, r * 1.2 + 4, zz, g, 12); cyl(4.2, 6, M.black, 'y', r * .6, r * 1.2 + 10, zz, g, 12); }
  return g; }
const DET = {};
{ // ----- frame: T-slot perimeter, bolts on table, cabinet panel logo, leveling feet -----
  for (const z of [-210, 210]) profile(1700, 'x', -520, TT + 20, z, gFrame);
  for (const x of [-1365, 325]) profile(380, 'z', x, TT + 20, 0, gFrame);
  const L = []; for (let x = -1340; x <= 300; x += 80) for (const z of [-170, 170]) L.push([x, TT, z]); bolts(gFrame, L);
  plate(560, 120, (c, w, h) => { const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#1d2229'); g.addColorStop(1, '#2b323c'); c.fillStyle = g; c.fillRect(0, 0, w, h); c.fillStyle = '#ff7a2a'; c.fillRect(0, 0, 14, h); c.fillStyle = '#e8ecf1'; c.font = `bold ${h * .42}px Rubik, Arial`; c.fillText('PIPECUT  PC-100', w * .06, h * .5); c.fillStyle = '#9aa6b2'; c.font = `${h * .2}px Arial`; c.fillText('MARK · ROUND · CUT  ±0.3 mm  |  CE  PL d', w * .06, h * .82); }, -820, 560, 232, gFrame, 0, 3);
  for (const x of [-1350, 310, 690]) for (const z of [-205, 205]) { cyl(6, 50, M.steel, 'y', x, 40, z, gFrame, 12); cyl(10, 8, M.steel, 'y', x, 48, z, gFrame, 6); cyl(34, 8, M.steel, 'y', x, 4, z, gFrame, 32); }
  // panel seams & vent slots
  for (const x of [-1100, -540, 20]) box(4, 500, 3, M.black, x, 470, 232, gFrame);
  for (let i = 0; i < 8; i++) box(120, 5, 3, M.black, -300, 650 + i * 14, 232, gFrame);
}
{ // ----- cabinet -----
  box(4, 400, 3, M.black, -900, 470, -239, gCab); for (const s of [-1, 1]) box(12, 60, 14, M.steel, -900 + s * 230, 600, -236, gCab);
  box(16, 90, 18, M.black, -880, 470, -230, gCab); box(30, 14, 26, M.steel, -880, 500, -222, gCab);
  for (let i = 0; i < 6; i++) box(80, 5, 3, M.black, -1060, 360 + i * 12, -239, gCab);
  plate(160, 70, (c, w, h) => { c.fillStyle = '#c9ccd1'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; c.font = `bold ${h * .2}px Arial`; c.fillText('PC-100  CONTROL', w * .06, h * .26); c.font = `${h * .14}px Arial`; ['400 V 3~ 50 Hz  16 A', 'IP54  ·  SN 2026-1024', 'Safety PLC  PL d / SIL 2'].forEach((s, i) => c.fillText(s, w * .06, h * (.5 + i * .18))); }, -1060, 600, -238.5, gCab, 0, 5);
  plate(70, 62, (c, w, h) => { c.fillStyle = '#f2c11d'; c.beginPath(); c.moveTo(w / 2, 4); c.lineTo(w - 4, h - 4); c.lineTo(4, h - 4); c.closePath(); c.fill(); c.lineWidth = 6; c.strokeStyle = '#111'; c.stroke(); c.fillStyle = '#111'; c.font = `bold ${h * .55}px Arial`; c.textAlign = 'center'; c.fillText('⚡', w / 2, h * .85); }, -760, 600, -238.5, gCab, 0, 5);
}
{ // ----- feeder: linear guide, servo, coupling, drag chain -----
  linRail(1440, -700, Y0 - 12, RAIL_Z, gFeed); linBlock(0, Y0 - 4 - 8, RAIL_Z, carriage); carriage.children.forEach(o => { if (o.position.x === 0 && o.position.y === Y0 - 12) o.position.y = Y0 - 12; });
  motor.visible = false; servo(gFeed, -1555, Y0 + 2, RAIL_Z, 'x', 130, 86); cyl(14, 30, M.alu, 'x', -1475, Y0 + 2, RAIL_Z, gFeed, 24);
  bolts(gFeed, [[-1450, Y0 + 30, RAIL_Z - 20], [-1450, Y0 + 30, RAIL_Z + 20], [50, Y0 + 30, RAIL_Z - 20], [50, Y0 + 30, RAIL_Z + 20]]);
  // drag chain (instanced links), updated per frame
  const N = 58, pitch = 30; const link = new THREE.InstancedMesh(new RoundedBoxGeometry(pitch - 2, 22, 44, 2, 3), phys({ color: 0x1a1c20, metalness: 0, roughness: .55, clearcoat: .3 }), N); link.castShadow = true; gFeed.add(link);
  const pin = new THREE.InstancedMesh(new THREE.CylinderGeometry(3, 3, 46, 8), M.steel.clone(), N); gFeed.add(pin);
  DET.chain = { link, pin, N, pitch, R: 48, xf: -1450, y0: Y0 - 92, z: RAIL_Z - 75 };
  box(60, 20, 50, M.alu, -1450, Y0 - 92, RAIL_Z - 75, gFeed); box(20, 120, 50, M.alu, -20, Y0 - 30, RAIL_Z - 75 + 0, carriage); carriage.children.at(-1).position.set(-20, Y0 - 10, RAIL_Z - 75);
  box(1600, 6, 60, M.alu, -700, Y0 - 106, RAIL_Z - 75, gFeed);
}
{ // ----- infeed details -----
  const L = []; vRollers.forEach(v => { const x = v.parent.position.x; L.push([x - 22, TT + 70, -50], [x + 22, TT + 70, -50], [x - 22, TT + 70, 50], [x + 22, TT + 70, 50]); }); bolts(gIn, L);
}
{ // ----- clamps: pneumatic cylinders, valve island, FRL, hoses -----
  for (const c of [clampA, clampB]) c.jaws.forEach(j => { j.children.filter(o => o.geometry && o.geometry.type !== 'RoundedBoxGeometry' && o.position.z !== 0).forEach(o => o.visible = false); });
  for (const c of [clampA, clampB]) c.jaws.forEach(j => { const s = j.userData.s, x = j.children[0].position.x; const pc = pneu(j, x, Y0, s * 62, 60, 15); cyl(5, 30, M.steel, 'z', x, Y0, s * 24, j, 16); bolts(j, [[x - 10, Y0 + 22, -s * 6], [x + 10, Y0 + 22, -s * 6]], .6); });
  const v = new THREE.Group(); gFrame.add(v); v.position.set(-260, TT, 150);
  box(150, 30, 60, M.alu, 0, 15, 0, v); for (let i = 0; i < 4; i++) { box(26, 50, 40, M.black, -52 + i * 34, 55, 0, v); box(8, 6, 3, phys({ color: 0x30ff70, emissive: 0x30ff70, emissiveIntensity: 1.5 }), -52 + i * 34, 72, 21, v); }
  const frl = new THREE.Group(); gFrame.add(frl); frl.position.set(-420, TT, 170); box(50, 60, 50, M.alu, 0, 110, 0, frl); cyl(20, 70, M.glassClear, 'y', 0, 45, 0, frl, 24); cyl(18, 8, M.black, 'y', 0, 150, 0, frl, 24); cyl(16, 6, M.white, 'z', 0, 110, 28, frl, 24);
  plate(26, 26, (c, w, h) => { c.fillStyle = '#fff'; c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 2, 0, TAU); c.fill(); c.strokeStyle = '#222'; c.lineWidth = 3; c.stroke(); c.save(); c.translate(w / 2, h / 2); for (let i = 0; i <= 10; i++) { c.rotate(i ? .45 : -2.3); c.fillRect(-1, -w / 2 + 4, 2, 6); } c.restore(); c.strokeStyle = '#c00'; c.lineWidth = 3; c.beginPath(); c.moveTo(w / 2, h / 2); c.lineTo(w * .78, h * .3); c.stroke(); }, 0, 110, 31.5, frl, 0, 8);
  const H = (pts) => tube(pts, 3.2, M.hose, gFrame, 48);
  H([[-420, TT + 140, 195], [-380, TT + 160, 220], [-310, TT + 80, 190], [-300, TT + 20, 150]]);
  for (const [cx, k] of [[-24, 0], [55, 1]]) for (const s of [-1, 1]) { const px = -310 + (k * 2 + (s + 1) / 2) * 34 + 8; const ez = s * (10 + 15 + 62 + 30) + s * 0; H([[px, TT + 82, 175], [px, TT + 140, 190], [cx - 60, Y0 + 60, s > 0 ? 160 : 60], [cx - 10, Y0 + 30, ez * .9]]); }
}
{ // ----- chamfer head: rail + blocks + servo + spindle detail -----
  linRail(300, 330, TT + 37, -35, gCh); linRail(300, 330, TT + 37, 35, gCh);
  linBlock(250, TT + 56, -35, chSlide); linBlock(350, TT + 56, -35, chSlide); linBlock(250, TT + 56, 35, chSlide); linBlock(350, TT + 56, 35, chSlide);
  servo(gCh, 540, TT + 70, 0, 'x', 100, 60); bolts(chSlide, [[240, Y0 + 55, -40], [360, Y0 + 55, -40], [240, Y0 + 55, 40], [360, Y0 + 55, 40]]);
  for (let i = 0; i < 6; i++) { const a = i * TAU / 6; bolts(chSpin, [[-15, Math.cos(a) * 38, Math.sin(a) * 38, 'x', -1]], .6); }
  plate(70, 26, (c, w, h) => { c.fillStyle = '#e8ecf1'; c.fillRect(0, 0, w, h); c.fillStyle = '#c2551b'; c.font = `bold ${h * .55}px Arial`; c.fillText('R-FORM', w * .08, h * .72); }, 300, Y0 + 30, 56, chSlide, 0, 8);
  tube([[420, Y0 + 40, -40], [460, Y0 + 120, -120], [520, TT + 140, -180], [560, TT + 60, -200]], 5, M.cable, gCh);
}
{ // ----- laser: galvo detail, fume nozzle, warning sign, fiber cable -----
  plate(90, 30, (c, w, h) => { c.fillStyle = '#111'; c.fillRect(0, 0, w, h); c.fillStyle = '#ff7a2a'; c.font = `bold ${h * .5}px Arial`; c.fillText('FIBER  GALVO', w * .06, h * .65); }, 55, Y0 + 235, 61, gLaser, 0, 8);
  for (const s of [-1, 1]) box(20, 60, 10, M.alu, 55 + s * 66, Y0 + 230, 0, gLaser);
  tube([[55, Y0 + 285, -60], [55, Y0 + 340, -120], [140, Y0 + 380, -170], [160, TT + 420, -170]], 4, M.cableBk, gLaser);
  // fume nozzle near work
  cyl(18, 120, M.alu, 'z', 55, Y0 + 60, -110, gSrc, 24); cyl(24, 20, M.black, 'z', 55, Y0 + 60, -50, gSrc, 24, 18);
  plate(80, 70, (c, w, h) => { c.fillStyle = '#f2c11d'; c.beginPath(); c.moveTo(w / 2, 3); c.lineTo(w - 3, h - 3); c.lineTo(3, h - 3); c.closePath(); c.fill(); c.lineWidth = 5; c.strokeStyle = '#111'; c.stroke(); c.fillStyle = '#111'; c.beginPath(); c.arc(w / 2, h * .62, h * .1, 0, TAU); c.fill(); c.lineWidth = 3; for (let i = 0; i < 8; i++) { const a = i * TAU / 8; c.beginPath(); c.moveTo(w / 2 + Math.cos(a) * h * .14, h * .62 + Math.sin(a) * h * .14); c.lineTo(w / 2 + Math.cos(a) * h * .24, h * .62 + Math.sin(a) * h * .24); c.stroke(); } }, 55, Y0 + 180, 133, gEncl, 0, 6);
  plate(150, 26, (c, w, h) => { c.fillStyle = '#f2c11d'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; c.font = `bold ${h * .48}px Arial`; c.textAlign = 'center'; c.fillText('LASER CLASS 1 · INTERLOCK', w / 2, h * .66); }, 55, Y0 + 120, 133, gEncl, 0, 6);
}
{ // ----- saw: spindle motor, blade texture, ram -----
  const bt = canvasTex(512, 512, (x, w, h) => { x.fillStyle = '#9aa0a8'; x.fillRect(0, 0, w, h); x.translate(w / 2, h / 2); for (let r = 20; r < 250; r += 1.5) { const v = 130 + Math.random() * 80 | 0; x.strokeStyle = `rgba(${v},${v},${v},.5)`; x.beginPath(); x.arc(0, 0, r, 0, TAU); x.stroke(); } for (let i = 0; i < 6; i++) { x.rotate(TAU / 6); x.fillStyle = '#3a3f46'; x.fillRect(110, -3, 90, 6); } x.fillStyle = '#c2551b'; x.font = 'bold 34px Arial'; x.textAlign = 'center'; x.fillText('HSS-Co  Ø140', 0, -150); }, [1, 1], true);
  bladeDisk.material.map = bt; bladeDisk.material.color.set(0xffffff); bladeDisk.material.needsUpdate = true;
  servo(sawHead, 0, 0, -300, 'z', 110, 80, M.black);
  cyl(10, 300, M.steel, 'y', 40, Y0 + 90, -230, gSaw, 16); cyl(10, 300, M.steel, 'y', -40, Y0 + 90, -230, gSaw, 16);
  bolts(gSaw, [[0, Y0 + 230, -200, 'z'], [0, Y0 - 50, -200, 'z']]);
  plate(60, 22, (c, w, h) => { c.fillStyle = '#111'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = `bold ${h * .55}px Arial`; c.fillText('CUT-OFF', w * .1, h * .7); }, 36, 0, -130, sawHead, Math.PI / 2, 8);
}
{ // ----- gauge & sort extras -----
  tube([[GX - 70, GY + 100, -50], [GX - 20, GY + 160, -120], [GX + 40, TT + 80, -200]], 3.5, M.cableBk, gGauge); tube([[GX + 70, GY + 100, -50], [GX + 60, GY + 170, -120], [GX + 40, TT + 80, -200]], 3.5, M.cableBk, gGauge);
  for (const k in binZ) plate(90, 30, (c, w, h) => { c.fillStyle = '#' + binCol[k].toString(16).padStart(6, '0'); c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = `bold ${h * .6}px Rubik, Arial`; c.textAlign = 'center'; c.fillText({ ok: 'OK ✓', rej: 'NG ✗', scrap: 'SCRAP' }[k], w / 2, h * .75); }, BIN_X + 82, BIN_Y + 50, binZ[k], gSort, Math.PI / 2, 6);
  pneu(gSort, 500, CH1.y - 50, 70, 50, 10, 'y');
}
{ // ----- HMI live screen, light curtain detail -----
  const sc = document.createElement('canvas'); sc.width = 520; sc.height = 340; const st = new THREE.CanvasTexture(sc); st.colorSpace = THREE.SRGBColorSpace;
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(260, 170), new THREE.MeshBasicMaterial({ map: st, toneMapped: false })); scr.position.set(-1500, 1250, 448.5); gHmi.add(scr); DET.hmi = { c: sc, t: st };
  gHmi.traverse(o => { if (o.isMesh && o.material.emissiveIntensity === .7) o.visible = false; });
  box(36, 36, 6, M.yellow, -1360, 1150, 448, gHmi); plate(60, 16, (c, w, h) => { c.fillStyle = '#f2c11d'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; c.font = `bold ${h * .6}px Arial`; c.textAlign = 'center'; c.fillText('EMERGENCY', w / 2, h * .72); }, -1360, 1105, 446, gHmi, 0, 8);
  for (const x of [-1300, -100]) { for (let i = 0; i < 12; i++) cyl(2.5, 3, phys({ color: 0x400000, emissive: 0xff2020, emissiveIntensity: 2 }), 'x', x + (x < -500 ? 20 : -20), TT + 40 + i * 30, CZ, gCur, 10); cyl(20, 12, M.black, 'y', x, TT + 426, CZ, gCur, 20); }
  tube([[-1300, TT + 10, CZ], [-1320, TT - 60, CZ - 60], [-1000, TT - 100, -200], [-900, 600, -240]], 4, M.cableBk, gCur);
}
function updDetails(now) {
  const C = DET.chain; if (C) { const xc = carriage.position.x - 20; const Lc = C.N * C.pitch; const xb = (Lc - Math.PI * C.R + C.xf + xc) / 2; const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let i = 0; i < C.N; i++) { const s = (i + .5) * C.pitch; let x, y, a; const a1 = xb - C.xf, arc = Math.PI * C.R;
      if (s < a1) { x = C.xf + s; y = C.y0; a = 0; } else if (s < a1 + arc) { const t = (s - a1) / C.R; x = xb + Math.sin(t) * C.R; y = C.y0 + C.R - Math.cos(t) * C.R; a = t; } else { x = xb - (s - a1 - arc); y = C.y0 + 2 * C.R; a = Math.PI; }
      q.setFromEuler(e.set(0, 0, a)); m4.compose(new THREE.Vector3(x, y, C.z), q, new THREE.Vector3(1, 1, 1)); C.link.setMatrixAt(i, m4); C.pin.setMatrixAt(i, m4.compose(new THREE.Vector3(x - C.pitch / 2 * Math.cos(a), y - C.pitch / 2 * Math.sin(a), C.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), new THREE.Vector3(1, 1, 1))); }
    C.link.instanceMatrix.needsUpdate = true; C.pin.instanceMatrix.needsUpdate = true; }
  if (DET.hmi && (!DET.hmi.last || now - DET.hmi.last > .5)) { DET.hmi.last = now; const c = DET.hmi.c.getContext('2d'), w = 520, h = 340;
    c.fillStyle = '#0b1622'; c.fillRect(0, 0, w, h); c.fillStyle = '#13283c'; c.fillRect(0, 0, w, 46); c.fillStyle = '#ff9a5a'; c.font = 'bold 24px Arial'; c.fillText('PC-100  ' + (S.estop ? 'E-STOP' : S.safety ? 'SAFETY STOP' : S.run ? 'AUTO RUN' : 'READY'), 14, 31);
    c.fillStyle = S.estop || S.safety ? '#ff4d4d' : S.run ? '#4dff88' : '#ffc04d'; c.beginPath(); c.arc(w - 26, 23, 10, 0, TAU); c.fill();
    c.font = '20px Arial'; c.fillStyle = '#9fb3c8'; const rows = [['GOOD PCS', S.n - S.rej], ['REJECTS', S.rej], ['LAST LEN', S.lastLen ? S.lastLen.toFixed(2) + ' mm' : '--'], ['STOCK REM', stock.present ? stock.L.toFixed(0) + ' mm' : '--'], ['FEED', P.spd + ' mm/s'], ['RADIUS', 'R' + P.rad.toFixed(1)], ['MARK', P.int + ' mm']];
    rows.forEach(([k, v], i) => { const col = i < 4 ? 0 : 1, row = i < 4 ? i : i - 4; c.fillStyle = '#7f93a8'; c.fillText(k, 16 + col * 260, 86 + row * 62); c.fillStyle = '#e8f2ff'; c.font = 'bold 26px Arial'; c.fillText(String(v), 16 + col * 260, 114 + row * 62); c.font = '20px Arial'; });
    const L = S.lens.slice(-40); c.strokeStyle = '#2c4a66'; c.strokeRect(276, 250, 230, 76); c.strokeStyle = '#4dff88'; c.beginPath(); L.forEach((v, i) => { const X = 276 + i / 39 * 230, Y = 288 - (v - 100) * 30; i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.stroke(); DET.hmi.t.needsUpdate = true; }
}

for (const id of partOrder) parts[id].base.copy(parts[id].g.position);

// ---------- pipe / pieces ----------
const P = { spd: 150, rad: 1, int: 1, num: true, len: 600, dia: 20, mat: 'steel', cut: 'orb', sim: 1 };
const wall = () => Math.max(1.2, P.dia * 0.08);
const kerf = () => P.cut === 'saw' ? 1.6 : 0;
const pipeRough = brushed.clone(); pipeRough.repeat.set(1, 6); const pipeN = brushedN.clone(); pipeN.repeat.set(1, 6);
const pipeMat = new THREE.MeshPhysicalMaterial({ color: 0xa9afb6, metalness: 1, roughness: .3, roughnessMap: pipeRough, normalMap: pipeN, normalScale: new THREE.Vector2(.15, .15), clearcoat: .15, envMapIntensity: 1.2 });
function applyMat() { const m = MATS[P.mat]; pipeMat.color.set(m.c); pipeMat.metalness = m.m; pipeMat.roughness = m.r; $('techNote').innerHTML = '<b>טכנולוגיית סימון מומלצת לחומר:</b> ' + m.laser; }
function arcPts(pts, cx, cy, r, a0, a1, n = 8) { for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); pts.push(new THREE.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r)); } }
function pipeGeo(L, fR, bR) { // lathe along +Y from -L..0 (front at 0)
  const R = P.dia / 2, r = R - wall(); const mx = (R - r) * .9; fR = Math.min(fR, mx); bR = Math.min(bR, mx);
  const pts = [];
  pts.push(new THREE.Vector2(r, -L + .3)); pts.push(new THREE.Vector2(r + .3, -L));
  if (bR > .05) { pts.push(new THREE.Vector2(R - bR, -L)); arcPts(pts, R - bR, -L + bR, bR, -Math.PI / 2, 0); } else { pts.push(new THREE.Vector2(R - .05, -L)); pts.push(new THREE.Vector2(R, -L + .05)); }
  if (fR > .05) { pts.push(new THREE.Vector2(R, -fR - .01)); arcPts(pts, R - fR, -fR, fR, 0, Math.PI / 2); } else { pts.push(new THREE.Vector2(R, -.05)); pts.push(new THREE.Vector2(R - .05, 0)); }
  pts.push(new THREE.Vector2(r + .3, 0)); pts.push(new THREE.Vector2(r, -.3)); pts.push(new THREE.Vector2(r, -L + .3));
  const g = new THREE.LatheGeometry(pts, 56); g.rotateZ(-Math.PI / 2); return g; // +Y -> +X
}
// mark texture (ruler)
const TPX = 20; // px per mm along axis
function newMarkTex() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 100 * TPX + 40; const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16; return { c, ctx: c.getContext('2d'), t, drawn: -1 };
}
function tickList() { const L = []; for (let mm = 0; mm <= 100; mm++) { const k = mm % 10 === 0 ? 3 : mm % 5 === 0 ? 2 : 1; if ((P.int === 5 && k < 2) || (P.int === 10 && k < 3)) continue; L.push([mm, k]); } return L; }
function drawTicks(mt, upto, list) { // draw ticks with index <= upto
  const { ctx, c } = mt; const circ = Math.PI * P.dia; const pxmm = c.width / circ; const lenMM = [0, 2.4, 4.2, 6.5]; const dark = P.mat === 'al' ? '#f4f4f4' : P.mat === 'pvc' ? '#1a1a1a' : '#14100c';
  for (let i = mt.drawn + 1; i <= upto && i < list.length; i++) {
    const [mm, k] = list[i]; const y = 20 + mm * TPX; const sc = TPX / 10; const w = lenMM[k] * pxmm;
    ctx.fillStyle = dark; ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 2 * sc; ctx.fillRect(c.width / 2 - w / 2, y - (k === 3 ? 2.2 : 1.6) * sc, w, (k === 3 ? 4.4 : 3.2) * sc); ctx.shadowBlur = 0;
    if (P.num && k === 3 && mm > 0 && mm < 100) { ctx.save(); ctx.translate(c.width / 2 + w / 2 + 6 * sc, y); ctx.rotate(-Math.PI / 2); ctx.scale(1, pxmm / TPX * 1.0); ctx.font = `bold ${Math.round(2.4 * TPX)}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(String(mm), 0, 0); ctx.restore(); }
  }
  mt.drawn = Math.max(mt.drawn, Math.min(upto, list.length - 1)); mt.t.needsUpdate = true;
}
function markMesh(mt) {
  const R = P.dia / 2 + .06; const g = new THREE.CylinderGeometry(R, R, 100 + 2, 64, 1, true); g.rotateZ(-Math.PI / 2);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: mt.t, transparent: true, metalness: .3, roughness: .7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.rotation.x = Math.PI / 2; m.renderOrder = 2; return m;
}
const stock = { g: new THREE.Group(), mesh: null, L: 0, front: 0, fR: 0, bR: 0, mark: null, markMesh: null, present: false };
scene.add(stock.g);
function rebuildStock() { if (stock.mesh) { stock.g.remove(stock.mesh); stock.mesh.geometry.dispose(); } stock.mesh = add(new THREE.Mesh(pipeGeo(stock.L, stock.fR, stock.bR), pipeMat), stock.g); stock.mesh.userData.keep = 1; }
function newStockMark() { if (stock.markMesh) stock.g.remove(stock.markMesh); stock.mark = newMarkTex(); stock.markMesh = markMesh(stock.mark); stock.markMesh.position.x = -50 - 1; stock.markMesh.visible = false; stock.markMesh.userData.keep = 1; stock.g.add(stock.markMesh); }
const pieces = []; // {g, path, t0, bin, meas}
// ---------- machine state ----------
const FRONT_T = () => 100 + kerf() / 2; // front target (cut plane at x=0)
const MIN_TAIL = -6; // pusher clearance to clamp A rear face (mm)
const S = { run: false, estop: false, safety: false, phase: 'idle', t: 0, cycleStart: 0, lastCycle: 0, n: 0, rej: 0, total: 0, scrap: 0, lens: [], hist: [], offset: 0, drift: 0, piecesThisPipe: 0, clampA: 0, clampB: 0, chX: 0, sawY: 0, flap: 0, laserIdx: -1, simT: 0 };
const PH = { idle: 'מוכן', load: 'טעינת צינור', feed: 'הזנה סרוו', clamp: 'תפיסה כפולה', chamfer: 'עיגול קצה', mark: 'סימון לייזר', cut: 'חיתוך', release: 'שחרור', eject: 'פליטת שארית', estop: 'עצירת חירום', safety: 'עצירה – וילון אור' };
function canMake() { return stock.present && stock.L - FRONT_T() + 0 >= 0 && (FRONT_T() - stock.L) <= MIN_TAIL - 24 + 24 && stock.L >= FRONT_T() - MIN_TAIL + 0; }
function piecesFor(L) { const k = kerf(); let n = 0; let l = L; while (l >= FRONT_T() - MIN_TAIL) { n++; l -= 100 + k; } return { n, rem: l }; }
function setPhase(p) { S.phase = p; S.t = 0; }
function loadPipe() {
  stock.L = P.len; stock.fR = 0; stock.bR = 0.2; stock.front = -40; stock.present = true; S.piecesThisPipe = 0;
  rebuildStock(); newStockMark(); stock.g.position.set(stock.front, Y0, 260); setPhase('load'); toast('צינור ' + P.len + ' ממ נטען · צפי: ' + piecesFor(P.len).n + ' חתיכות');
}
// ---------- UI hookup ----------
const fmt = (v, d = 1) => (+v).toFixed(d);
function syncUI() { $('vSpd').textContent = P.spd + ' ממ/ש'; $('vRad').textContent = 'R ' + fmt(P.rad) + ' ממ'; $('vLen').textContent = P.len + ' ממ'; $('vDia').textContent = 'Ø' + P.dia + ' ממ'; $('vSim').textContent = '×' + P.sim;
  ['sSpd', 'sRad', 'sLen', 'sDia', 'sSim'].forEach(id => { const k = { sSpd: 'spd', sRad: 'rad', sLen: 'len', sDia: 'dia', sSim: 'sim' }[id]; $(id).value = P[k]; });
  $('sMat').value = P.mat; $('sCut').value = P.cut; $('cNum').checked = P.num; $('vInt').textContent = P.int + ' ממ';
  document.querySelectorAll('#segInt button').forEach(b => b.classList.toggle('on', +b.dataset.v === P.int)); applyMat(); updCalc(); }
for (const k in MATS) $('sMat').insertAdjacentHTML('beforeend', `<option value="${k}">${MATS[k].n}</option>`);
const bind = (id, k, f = Number) => $(id).addEventListener('input', e => { P[k] = f(e.target.value); syncUI(); if (k === 'dia') onDia(); });
bind('sSpd', 'spd'); bind('sRad', 'rad'); bind('sLen', 'len'); bind('sDia', 'dia'); bind('sSim', 'sim'); bind('sMat', 'mat', String); bind('sCut', 'cut', String);
$('cNum').onchange = e => { P.num = e.target.checked; };
document.querySelectorAll('#segInt button').forEach(b => b.onclick = () => { P.int = +b.dataset.v; syncUI(); });
function onDia() { if (stock.present) { rebuildStock(); const mk = stock.mark.drawn; newStockMark(); } }
const PRESETS = { 'ברירת מחדל – פלדה Ø20': { spd: 150, rad: 1, int: 1, dia: 20, mat: 'steel', cut: 'orb', len: 600 }, 'נירוסטה Ø25 – סימון כל 5': { spd: 100, rad: 1.5, int: 5, dia: 25, mat: 'ss', cut: 'orb', len: 1000 }, 'אלומיניום Ø16 – מהיר': { spd: 300, rad: .5, int: 1, dia: 16, mat: 'al', cut: 'saw', len: 800 }, 'נחושת Ø15 – כל 10': { spd: 120, rad: .8, int: 10, dia: 15, mat: 'cu', cut: 'orb', len: 500 }, 'PVC Ø32 – דיו': { spd: 200, rad: 2, int: 5, dia: 32, mat: 'pvc', cut: 'saw', len: 1200 } };
function loadUserPresets() { try { return JSON.parse(localStorage.getItem('pcs_presets') || '{}'); } catch { return {}; } }
function fillPresets() { const all = { ...PRESETS, ...loadUserPresets() }; $('preset').innerHTML = Object.keys(all).map(k => `<option>${k}</option>`).join(''); return all; }
let ALLP = fillPresets();
$('preset').onchange = e => { Object.assign(P, ALLP[e.target.value]); syncUI(); onDia(); toast('מתכון נטען: ' + e.target.value); };
$('bSave').onclick = () => { const n = prompt('שם המתכון:', 'מתכון ' + new Date().toLocaleDateString('he-IL')); if (!n) return; const u = loadUserPresets(); u[n] = { spd: P.spd, rad: P.rad, int: P.int, dia: P.dia, mat: P.mat, cut: P.cut, len: P.len }; localStorage.setItem('pcs_presets', JSON.stringify(u)); ALLP = fillPresets(); $('preset').value = n; toast('נשמר'); };
$('bStart').onclick = () => { if (S.estop) { S.estop = false; document.body.classList.remove('estop'); toast('איפוס עצירת חירום – בדוק אזור עבודה'); } if (S.safety) return toast('וילון האור חסום – הוצא את היד'); S.run = true; if (!stock.present) loadPipe(); };
$('bPause').onclick = () => { S.run = false; };
$('bStop').onclick = () => { S.estop = true; S.run = false; document.body.classList.add('estop'); toast('⛔ עצירת חירום: STO – הסרוו והציר הורדו מכוח, הלייזר נחסם'); };
$('bLoad').onclick = () => { if (stock.present && S.phase !== 'idle') { ejectRemnant(true); } loadPipe(); S.run = true; };
$('bReset').onclick = () => { Object.assign(S, { n: 0, rej: 0, total: 0, scrap: 0, lens: [], offset: 0, drift: 0 }); pieces.splice(0).forEach(p => scene.remove(p.g)); updData(); };
// tabs
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => { document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b)); document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.id === 't-' + b.dataset.t)); if (b.dataset.t === 'data') updData(); });
$('mbtn').onclick = () => document.body.classList.add('menuopen'); $('pclose').onclick = () => document.body.classList.remove('menuopen');
function toast(s) { const t = $('toast'); t.textContent = s; t.style.display = 'block'; clearTimeout(toast.h); toast.h = setTimeout(() => t.style.display = 'none', 3200); }

// ---------- X-RAY / explode / highlight ----------
let XRAY = false, EXP = 0, expTarget = null, HL = null, LBL = !IS_MOBILE;
$('bLbl').classList.toggle('on', LBL);
function eachMesh(fn) { for (const id of partOrder) parts[id].g.traverse(o => { if (o.isMesh) fn(o, parts[id]); }); }
eachMesh(o => { o.userData.op = o.material.opacity; o.userData.tr = o.material.transparent; o.userData.em = o.material.emissive ? o.material.emissive.clone() : null; o.userData.ei = o.material.emissiveIntensity; });
function applyLook() {
  eachMesh((o, p) => { const m = o.material; const hl = HL && HL.includes(p.id);
    if (XRAY && !hl) { m.transparent = true; m.opacity = p.shell ? .05 : .16; m.depthWrite = false; if (m.emissive) { m.emissive.set(0x3fa6e6); m.emissiveIntensity = .35; } }
    else { m.transparent = o.userData.tr; m.opacity = o.userData.op; m.depthWrite = !o.userData.tr; if (m.emissive) { m.emissive.copy(o.userData.em); m.emissiveIntensity = o.userData.ei; } }
    if (HL && !hl && !XRAY) { m.transparent = true; m.opacity = Math.min(o.userData.op, .22); m.depthWrite = false; }
    if (hl && m.emissive) { m.emissive.set(0xff7a2a); m.emissiveIntensity = .28; }
    m.needsUpdate = true; });
  pipeMat.emissive.set(XRAY ? 0x222222 : 0); }
$('bX').onclick = () => { XRAY = !XRAY; $('bX').classList.toggle('on', XRAY); applyLook(); };
$('bLbl').onclick = () => { LBL = !LBL; $('bLbl').classList.toggle('on', LBL); };
$('sExp').oninput = e => { EXP = +e.target.value; expTarget = null; $('vExp').textContent = Math.round(EXP * 100) + '%'; };
$('bExp').onclick = () => { expTarget = EXP > .5 ? 0 : 1; };
function highlight(ids) { HL = ids; applyLook(); }

// ---------- labels ----------
const lblEls = {};
for (const id of partOrder) { const d = document.createElement('div'); d.className = 'lbl'; d.innerHTML = `<span class="n">${parts[id].no}</span>${parts[id].name}`; d.onclick = () => focusParts([id], parts[id].name, `<p>${parts[id].desc}</p>`); $('labels').appendChild(d); lblEls[id] = d; }
const tmpV = new THREE.Vector3();
function updLabels() {
  const W = innerWidth, H = innerHeight; const show = LBL || EXP > .05 || HL;
  for (const id of partOrder) { const el = lblEls[id]; const p = parts[id];
    const vis = show && (LBL || EXP > .05 || (HL && HL.includes(id))) && !(IS_MOBILE && !(HL && HL.includes(id)) && EXP < .05 && !['laser', 'saw', 'chamfer', 'feeder', 'clampA', 'gauge'].includes(id));
    if (!vis) { el.style.display = 'none'; continue; }
    tmpV.copy(p.anchor).add(p.g.position).sub(p.base); tmpV.y += Y0 * (p.anchor.y < 2000 ? 1 : 0); tmpV.project(camera);
    if (tmpV.z > 1) { el.style.display = 'none'; continue; }
    el.style.display = 'block'; el.style.left = ((tmpV.x + 1) / 2 * W) + 'px'; el.style.top = ((1 - tmpV.y) / 2 * H) + 'px'; el.classList.toggle('hot', !!(HL && HL.includes(id))); }
}

// ---------- camera views ----------
const HOME = (innerWidth < innerHeight) ? { p: [250, 2700, 4300], t: [-420, 1050, 0] } : { p: [900, 2700, 3900], t: [-350, 850, 0] };
camera.position.set(...HOME.p); controls.target.set(...HOME.t);
let camTw = null, FOLLOW = false;
function flyTo(p, t, dur = 1.1) { camTw = { p0: camera.position.clone(), t0: controls.target.clone(), p1: new THREE.Vector3(...p), t1: new THREE.Vector3(...t), k: 0, dur }; }
$('bHome').onclick = () => { FOLLOW = false; $('bFollow').classList.remove('on'); highlight(null); flyTo(HOME.p, HOME.t); };
$('bFollow').onclick = () => { FOLLOW = !FOLLOW; $('bFollow').classList.toggle('on', FOLLOW); if (FOLLOW) flyTo([260, Y0 + 260, 520], [50, Y0, 0]); };

// ---------- stations ----------
const ST = [
  { t: '1 · טעינה והזנה (רולרי V)', ids: ['infeed', 'curtain'], cam: [-500, 1500, 1500], tg: [-800, 950, 0],
    b: '<p>המפעיל מניח צינור באורך 400–1200 ממ על שלושה רולרי V. ה-V ממרכז אוטומטית כל קוטר (12–40 ממ) כך שציר הצינור תמיד באותו גובה של המלחציים והלייזר.</p><p class="why">למה: ממרכז בלי כיוון ידני, ומזהה צינור עקום (רולר מרחף = התראה). הטעינה מחוץ לווילון האור – יד המפעיל אף פעם לא ליד כלי.</p>' },
  { t: '2 · מזין סרוו + מצמד פנימי + גלגל מדידה', ids: ['feeder', 'wheel'], cam: [-500, 1350, 900], tg: [-500, 1000, 0],
    b: '<p>מוט דוחף על בורג כדורי מונע במנוע סרוו עם מקודד 23-bit. בקצה – קולט מתרחב שנכנס לתוך הצינור ותופס מבפנים, כך שהצינור לא יכול להחליק. ההזנה היא 100 ממ + רוחב חיתוך (kerf) בכל מחזור, בפרופיל S-curve.</p><p class="why">בקרה כפולה: גלגל מדידה עם מקודד נפרד יושב על הצינור עצמו. אם יש הבדל ביניהם (החלקה) – המכונה מתקנת לפני התפיסה. כך מגיעים לדיוק של ±0.1–0.3 ממ, הרבה מתחת ל-±2 שנדרש.</p>' },
  { t: '3 · תפיסה כפולה – יציבות מקסימלית', ids: ['clampA', 'clampB', 'support'], cam: [150, 1250, 450], tg: [20, 1000, 0],
    b: '<p>שני מלחציים פנאומטיים עם לסתות V מצופות פוליאוריתן: A לפני קו החיתוך ו-B על החתיכה עצמה, כל אחד 8–20 ממ מקו החיתוך. הצינור מוחזק ב-3 נקודות בכל צד + תומך תחתון.</p><p class="why">למה שני צדדים: החתיכה לא "נופלת" באמצע החיתוך (מונע גרד ושבירה), אפס רעידות בזמן הסימון והעיגול. חיישן לחץ + חיישן מיקום בכל בוכנה מאשרים "תפוס" לפני כל פעולה. ווסת לחץ לפי חומר – PVC/אלומיניום לא נמעכים.</p>' },
  { t: '4 · עיגול קצה ברדיוס R', ids: ['chamfer'], cam: [420, 1220, 420], tg: [140, 1000, 0],
    b: '<p>ראש סיבובי עם 3 סכינים פרופיליות (Form tool) נע על ציר ונכנס על קצה הצינור בזמן שהוא תפוס. הרדיוס נקבע בהגדרות (0.2–3 ממ) – המכונה מחליפה עומק כניסה / קסטה של סכינים.</p><p class="why">העיגול נעשה <b>לפני</b> החיתוך כשהצינור עוד ארוך ותפוס בחוזקה – זה הכי יציב. כך לכל חתיכה יש קצה קדמי מעוגל. הקצה האחורי (קו החיתוך) מקבל ניקוי גרד; אפשר להוסיף ראש שני לעיגול דו-צדדי.</p>' },
  { t: '5 · סימון סרגל בלייזר', ids: ['laser', 'encl', 'source'], cam: [260, 1450, 520], tg: [50, 1050, 0],
    b: '<p>לייזר פייבר עם מראות Galvo מסמן קווים כמו בסרגל: כל 1 ממ קו קצר, כל 5 ממ בינוני, כל 10 ממ ארוך + מספר. בוחרים מרווח 1/5/10 ממ. כל השדה (100 ממ) מסומן בלי להזיז את הצינור – הקווים מתייחסים לאותה תפיסה כמו החיתוך, כך שה-0 של הסרגל תמיד בדיוק על הקצה.</p><p class="why">למה לייזר: ללא מגע, לא נמחק, מהיר (~1 שנ׳). חלופות: הזרקת דיו UV ל-PVC, גלגלת הטבעה לצינורות רכים. המארז Class-1 עם חלון מסנן ו-Interlock, ויניקת עשן עם HEPA+פחם.</p>' },
  { t: '6 · חיתוך מדויק', ids: ['saw'], cam: [320, 1300, -520], tg: [0, 1000, 0],
    b: '<p>מומלץ: חותך אורביטלי (גלגלת שמסתובבת סביב הצינור) – ללא נסורת, kerf≈0, חיתוך ישר ונקי. חלופה: מסור דיסק קרביד (kerf 1.6 ממ) עם קירור בערפל. ההזנה מוסיפה אוטומטית את רוחב החיתוך.</p><p class="why">ניטור עומס מנוע מזהה להב שחוק/שבור; מונה חיתוכים מתריע להחלפה לפני שהאיכות יורדת.</p>' },
  { t: '7 · מדידה, בדיקת סימון ומיון', ids: ['chute', 'gauge', 'sort'], cam: [900, 1300, 900], tg: [450, 750, 0],
    b: '<p>כל חתיכה מתגלגלת למד אורך לייזרי (±0.02 ממ) ומצלמה שבודקת שקווי הסרגל קיימים ובמקום. מסיט שולח: <b style="color:#7dff9e">תקין</b> / <b style="color:#ff8a80">פסול</b> (מחוץ ל-±2 או סימון חסר) / <b>שאריות</b>.</p><p class="why">לולאה סגורה: הממוצע של המדידות מזין תיקון אוטומטי להזנה (למשל התחממות של הבורג). 3 פסולים ברצף = עצירה והתראה.</p>' },
  { t: '8 · בטיחות ובקרה', ids: ['curtain', 'hmi', 'tower', 'cab'], cam: [-300, 1500, 2100], tg: [-500, 900, 200],
    b: '<p>וילון אור Type 4 באזור הטעינה, מארז נעול לאזור הכלים, עצירת חירום עם STO (Safe Torque Off), PLC בטיחותי ברמת PL d. מסך HMI לבחירת מתכון, מונים, היסטוריית תקלות. עמוד איתות: ירוק/כתום/אדום.</p>' },
];
$('stList').innerHTML = ST.map((s, i) => `<div class="card" data-i="${i}"><b>${s.t}</b><div class="t">${s.b.replace(/<[^>]+>/g, ' ').slice(0, 110)}…</div></div>`).join('');
let stIdx = -1, tourT = null;
document.querySelectorAll('#stList .card').forEach(c => c.onclick = () => showStation(+c.dataset.i));
function showStation(i) { stIdx = (i + ST.length) % ST.length; const s = ST[stIdx]; focusParts(s.ids, s.t, s.b, s.cam, s.tg); $('info').dataset.mode = 'st'; }
function focusParts(ids, title, body, cam, tg) {
  highlight(ids); $('iTitle').textContent = title; $('iBody').innerHTML = body; $('info').classList.add('on'); document.body.classList.remove('menuopen');
  if (!cam) { const p = parts[ids[0]]; const a = p.anchor.clone(); a.y += Y0; cam = [a.x + 500, a.y + 450, a.z + 900]; tg = [a.x, a.y, a.z]; }
  FOLLOW = false; const f = innerWidth < innerHeight ? 3.6 : 2.1; flyTo(cam.map((c, i) => tg[i] + (c - tg[i]) * f), tg);
}
$('iClose').onclick = () => { $('info').classList.remove('on'); highlight(null); clearInterval(tourT); tourT = null; };
$('iNext').onclick = () => { if ($('info').dataset.mode === 'risk') showRisk(rkIdx + 1); else showStation(stIdx + 1); };
$('iPrev').onclick = () => { if ($('info').dataset.mode === 'risk') showRisk(rkIdx - 1); else showStation(stIdx - 1); };
$('bTour').onclick = () => { clearInterval(tourT); showStation(0); tourT = setInterval(() => { if (stIdx >= ST.length - 1) { clearInterval(tourT); tourT = null; return; } showStation(stIdx + 1); }, 9000); if (!S.run) $('bStart').click(); };

// ---------- risks ----------
const RK = [
  ['high', 'החלקת הצינור → אורך לא מדויק', 'גלגלת/מלקחיים חיצוניים מחליקים על צינור שמנוני.', 'דוחף עם קולט פנימי (אחיזה חיובית) + גלגל מדידה נפרד על החומר; השוואת שני המקודדים ותיקון לפני תפיסה. נסה: "החלקת צינור".', ['feeder', 'wheel']],
  ['high', 'רעידות / חוסר יציבות', 'רעד בזמן עיגול/חיתוך פוגע בדיוק ובאיכות הקצה.', 'שלדה ממולאת פולימר-בטון, 2 מלחציים V משני צידי החיתוך (≤20 ממ), תומך תחתון, חיתוך אורביטלי בכוח נמוך.', ['clampA', 'clampB', 'support', 'frame']],
  ['high', 'בטיחות מפעיל', 'ידיים ליד להב, ראש מסתובב וקרן לייזר.', 'וילון אור Type 4, מארז נעול עם Interlock, התנעה דו-ידנית, עצירת חירום STO, PLC בטיחותי PL d. נסה: "יד נכנסת לווילון".', ['curtain', 'encl', 'hmi']],
  ['high', 'קרינת לייזר ועשן', 'החזרות קרן, אדים רעילים (במיוחד PVC → HCl).', 'מארז Class-1 + חלון OD6+, יניקה עם HEPA ופחם פעיל, נעילת הלייזר אם הדלת פתוחה. ל-PVC – דיו UV במקום לייזר.', ['encl', 'source', 'laser']],
  ['mid', 'סחיפת אורך (התחממות/בלאי)', 'הבורג מתחמם ומתארך, הלהב נשחק.', 'מד אורך על כל חתיכה + תיקון אוטומטי של היסט ההזנה (Closed-loop), התראה כש-Cpk יורד. נסה: "התחממות".', ['gauge', 'feeder']],
  ['mid', 'גרדים (Burrs) בקצה', 'קצוות חדים פוגעים במשתמש ובהרכבה.', 'עיגול רדיוס בכל קצה קדמי, חותך אורביטלי שמשאיר מינימום גרד, ניקוי גרד בקצה החיתוך.', ['chamfer', 'saw']],
  ['mid', 'עיוות מחום', 'סימון/חיתוך מחממים צינור דק או פלסטיק.', 'פולסים קצרים ב-MOPA (חום מינימלי), חיתוך במהירות נמוכה וקירור ערפל, מדידת אורך אחרי התקררות קצרה במסילה.', ['laser', 'saw']],
  ['mid', 'סימון לא מיושר לקצה', 'ה-0 של הסרגל לא בדיוק על הקצה.', 'הסימון נעשה כשהצינור כבר תפוס באותה תפיסה של החיתוך – אין תזוזה ביניהם. כיול Galvo יומי עם תבנית, מצלמה בודקת כל חתיכה.', ['laser', 'gauge']],
  ['low', 'שארית קצרה מ-100 ממ', 'סוף הצינור לא מספיק לחתיכה שלמה.', 'המחשבון יודע מראש כמה חתיכות יצאו; כשנשאר פחות מהמינימום – הדוחף משחרר והשארית נפלטת לפח שאריות. מוצג אורך צינור אופטימלי למינימום פחת.', ['sort', 'feeder']],
  ['low', 'בלאי כלים', 'סכיני עיגול ולהב מתבלים.', 'מונה חיתוכים, ניטור זרם/עומס מנוע, התראה מראש להחלפה, קסטות סכינים להחלפה מהירה.', ['chamfer', 'saw']],
  ['low', 'צינור עקום / קוטר שגוי', 'צינור לא ישר נתקע או נמדד לא נכון.', 'רולרי V עם חיישן, בדיקת קוטר בלייזר בכניסה, דחיית צינור לא תקין לפני ההזנה.', ['infeed']],
  ['low', 'חוסר אוויר דחוס / חשמל', 'מלחציים נפתחים לבד.', 'שסתומי בדיקה (Check valves) שומרים לחץ, חיישן לחץ ראשי, בלם מכני במנוע.', ['clampA', 'clampB', 'cab']],
];
const tagN = { high: 'סיכון גבוה', mid: 'בינוני', low: 'נמוך' };
$('riskList').innerHTML = RK.map((r, i) => `<div class="card" data-i="${i}"><span class="tag ${r[0] === 'high' ? '' : r[0] === 'mid' ? 'mid' : 'ok'}">${tagN[r[0]]}</span><b>${r[1]}</b><div class="t">⚠ ${r[2]}</div><div class="m">✔ ${r[3]}</div></div>`).join('');
let rkIdx = 0;
function showRisk(i) { rkIdx = (i + RK.length) % RK.length; const r = RK[rkIdx]; focusParts(r[4], '⚠ ' + r[1], `<p>${r[2]}</p><p class="why">✔ פתרון בתכנון: ${r[3]}</p>`); $('info').dataset.mode = 'risk'; }
document.querySelectorAll('#riskList .card').forEach(c => c.onclick = () => showRisk(+c.dataset.i));
$('fHand').onchange = e => { hand.visible = e.target.checked; };

// ---------- BOM ----------
const BOM = [
  ['frame', 'שלדת פלדה מרותכת + מילוי פולימר-בטון', 'בולמת רעידות'], ['infeed', 'רולרי V ×3, פוליאוריתן', 'עם חיישן נוכחות צינור'],
  ['feeder', 'סרוו 400W + בורג כדורי C5 + קולט פנימי', 'למשל Yaskawa Σ-7 / Delta B3 · HIWIN'], ['wheel', 'גלגל מדידה + מקודד 2500ppr', 'למשל Kübler / Sick DFV60'],
  ['clampA', 'מלחציים פנאומטיים V (×2)', 'למשל Festo DHPS / SMC MHZ + וסת לחץ'], ['support', 'תומך V תחתון', 'POM / פוליאוריתן'],
  ['chamfer', 'ראש עיגול סיבובי + ציר סרוו', 'סכיני פרופיל R0.2–R3, ציר HIWIN'], ['laser', 'סורק Galvo + עדשת F-theta 110×110', 'למשל Raycus/JPT MOPA 30W'],
  ['source', 'מקור לייזר פייבר + מערכת יניקת עשן', 'HEPA + פחם פעיל'], ['encl', 'מארז Class-1, פוליקרבונט OD6+', 'עם Interlock (Pilz / Schmersal)'],
  ['saw', 'חותך אורביטלי / מסור דיסק קרביד', 'מנוע 750W + ציר הורדה סרוו'], ['gauge', 'מד אורך לייזרי + מצלמה', 'למשל Keyence IG / Cognex In-Sight'],
  ['sort', 'מסיט פנאומטי + 3 פחים', 'תקין / פסול / שאריות'], ['curtain', 'וילון אור Type 4', 'למשל SICK deTec4 / Keyence GL-R'],
  ['hmi', 'HMI 10" + עצירת חירום + התנעה דו-ידנית', 'למשל Weintek / Siemens'], ['cab', 'PLC בטיחותי + ספקים', 'למשל Siemens S7-1200F / Omron NX'], ['tower', 'עמוד איתות LED 3 צבעים', 'Patlite / Werma'],
];
$('bomT').innerHTML = BOM.map(r => `<tr data-id="${r[0]}"><td>${parts[r[0]].no}</td><td>${r[1]}<small>${r[2]}</small></td></tr>`).join('');
document.querySelectorAll('#bomT tr').forEach(tr => tr.onclick = () => { const p = parts[tr.dataset.id]; focusParts([p.id], p.name, `<p>${p.desc}</p>`); });

// ---------- data / stats ----------
function updCalc() {
  const k = kerf(); const { n, rem } = piecesFor(P.len); const minL = FRONT_T() - MIN_TAIL;
  const opt = (m) => Math.ceil(minL + (m - 1) * (100 + k));
  $('calc').innerHTML = `<tr><td>חתיכות מצינור ${P.len} ממ</td><td class="n">${n}</td></tr><tr><td>שארית לפח</td><td class="n">${fmt(rem)} ממ</td></tr><tr><td>ניצולת חומר</td><td class="n">${fmt(n * 100 / P.len * 100)}%</td></tr><tr><td>Kerf (רוחב חיתוך)</td><td class="n">${fmt(k)} ממ</td></tr><tr><td>זמן משוער לצינור</td><td class="n">${fmt(n * estCycle())} שנ׳</td></tr>`;
  $('calcNote').innerHTML = 'אורכי צינור עם פחת מינימלי: ' + [4, 6, 8, 10].map(m => `<span class="pill">${opt(m)} ממ → ${m} חת׳</span>`).join('') + `<br>המינימום לחתיכה אחרונה: ${fmt(minL)} ממ (הדוחף צריך מרווח מהמלחציים).`;
}
function estCycle() { const m = MATS[P.mat]; return (100 + kerf()) / P.spd + .3 + .35 + (0.7 + P.rad * .25) + (0.25 + tickList().length * .011) + (P.cut === 'saw' ? 1.2 : 1.8) * m.cut * (P.dia / 20) ** .5 + .3; }
function updData() {
  const L = S.lens; const N = L.length; const mean = N ? L.reduce((a, b) => a + b, 0) / N : 0; const sd = N > 1 ? Math.sqrt(L.reduce((a, b) => a + (b - mean) ** 2, 0) / (N - 1)) : 0;
  const cpk = sd > 0 ? Math.min(102 - mean, mean - 98) / (3 * sd) : 0;
  $('stats').innerHTML = `<tr><td>נמדדו</td><td class="n">${N}</td></tr><tr><td>ממוצע</td><td class="n">${N ? fmt(mean, 3) : '–'} ממ</td></tr><tr><td>סטיית תקן σ</td><td class="n">${N > 1 ? fmt(sd, 3) : '–'} ממ</td></tr><tr><td>מינ׳ / מקס׳</td><td class="n">${N ? fmt(Math.min(...L), 2) + ' / ' + fmt(Math.max(...L), 2) : '–'}</td></tr><tr><td>Cpk (יכולת תהליך, ≥1.33 = מצוין)</td><td class="n" style="color:${cpk >= 1.33 ? '#7dff9e' : cpk >= 1 ? '#ffd27a' : '#ff8a80'}">${N > 2 ? fmt(cpk, 2) : '–'}</td></tr><tr><td>תיקון אוטומטי פעיל</td><td class="n">${fmt(-S.offset, 3)} ממ</td></tr><tr><td>שאריות שנפלטו</td><td class="n">${S.scrap}</td></tr>`;
  const c = $('hist'), x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height); const bins = new Array(40).fill(0); L.forEach(v => { const b = Math.floor((v - 98) / 0.1); if (b >= 0 && b < 40) bins[b]++; });
  const mx = Math.max(1, ...bins); const W = c.width, H = c.height - 30;
  x.fillStyle = 'rgba(77,255,136,.08)'; x.fillRect(0, 0, W, H);
  bins.forEach((v, i) => { x.fillStyle = Math.abs(98 + i * .1 + .05 - 100) > 2 ? '#ff6a5a' : '#ff9a4a'; const h = v / mx * (H - 10); x.fillRect(W - (i + 1) * W / 40 + 1, H - h, W / 40 - 2, h); });
  x.fillStyle = '#8b96a3'; x.font = '20px Rubik'; x.textAlign = 'center'; [98, 99, 100, 101, 102].forEach(v => x.fillText(v, W - (v - 98) / 4 * W + (v === 98 ? -14 : v === 102 ? 14 : 0), H + 24));
  x.strokeStyle = '#4dff88'; x.setLineDash([6, 6]); x.beginPath(); x.moveTo(W / 2, 0); x.lineTo(W / 2, H); x.stroke(); x.setLineDash([]);
  $('lastList').innerHTML = S.hist.slice(-10).reverse().map(h => `<span class="pill" style="color:${h.ok ? '#9fe3b4' : '#ff8a80'}">#${h.i} · ${fmt(h.v, 2)}${h.ok ? ' ✓' : ' ✗'}</span>`).join('') || '<span class="note">עוד אין חתיכות</span>';
}
$('bCsv').onclick = () => { const s = 'piece,length_mm,ok\n' + S.hist.map(h => `${h.i},${h.v.toFixed(3)},${h.ok ? 1 : 0}`).join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([s], { type: 'text/csv' })); a.download = 'pipe_lengths.csv'; a.click(); };

// ---------- cycle logic ----------
let feedFrom = 0, feedTo = 0, feedDur = 1, cutLen = 100, curList = [];
function nextPieceOrEject() {
  if (stock.L >= FRONT_T() - MIN_TAIL - .01) { feedFrom = stock.front; feedTo = FRONT_T(); feedDur = Math.max(.35, Math.abs(feedTo - feedFrom) / P.spd + .25); setPhase('feed'); S.cycleStart = S.simT; }
  else ejectRemnant(false);
}
function ejectRemnant(manual) {
  if (!stock.present) return;
  const rem = stock.L; const g = new THREE.Group(); const m = add(new THREE.Mesh(pipeGeo(rem, stock.fR, stock.bR), pipeMat), g); g.position.copy(stock.g.position);
  scene.add(g); pieces.push({ g, kind: 'scrap', t: 0, from: g.position.clone() }); S.scrap++;
  stock.present = false; stock.g.visible = false; if (!manual) toast('שארית ' + fmt(rem) + ' ממ נפלטה לפח השאריות' + (S.run ? ' · טוען צינור חדש' : '')); setPhase('idle');
}
function doCut() {
  // compute measured length
  const loop = $('fLoop').checked; let err = gauss() * (0.05 + 0.25 * (P.spd / 400) ** 2);
  if ($('fSlip').checked) { if (loop) err += gauss() * .06; else if (Math.random() < .45) err -= 1.2 + Math.random() * 2.2; }
  if ($('fHeat').checked) S.drift += 0.09;
  err += S.drift + S.offset; const v = 100 + err; const ok = Math.abs(err) <= 2;
  // piece mesh
  const g = new THREE.Group(); add(new THREE.Mesh(pipeGeo(100, stock.fR, .15), pipeMat), g);
  stock.g.remove(stock.markMesh); stock.markMesh.position.x = -50 - 1; g.add(stock.markMesh);
  g.position.set(stock.front - kerf() / 2 + (stock.front - kerf() / 2 - 100) * 0, Y0, 0); g.position.x = 100; scene.add(g);
  pieces.push({ g, kind: ok ? 'ok' : 'rej', t: 0, v, from: g.position.clone(), bin: ok ? 'ok' : 'rej' });
  stock.L -= 100 + kerf(); stock.fR = 0; stock.front = -kerf() / 2; rebuildStock(); newStockMark();
  S.n++; S.total++; if (!ok) S.rej++; S.lens.push(v); if (S.lens.length > 500) S.lens.shift(); S.hist.push({ i: S.total, v, ok }); if (S.hist.length > 500) S.hist.shift();
  S.lastLen = v; S.lastOk = ok;
  if (loop) S.offset -= 0.6 * (S.drift + S.offset); // closed-loop correction from gauge
  S.lastCycle = S.simT - S.cycleStart; S.piecesThisPipe++;
  if (!ok) toast('✗ חתיכה ' + S.total + ' נמדדה ' + fmt(v, 2) + ' ממ – נשלחה לפסולים' + (loop ? '' : ' · הפעל בקרה סגורה!'));
  if ($('t-data').classList.contains('on')) updData();
}
function step(dt) {
  S.simT += dt; S.t += dt; const t = S.t;
  if (hand.visible && !S.safety && !S.estop) { S.safety = true; S.wasRun = S.run; S.run = false; toast('🛑 וילון אור הופר – עצירה בטוחה (STO). הוצא את היד ולחץ הפעל'); }
  if (!hand.visible && S.safety) { S.safety = false; toast('אזור פנוי – לחץ ▶ הפעל להמשך'); }
  if (!S.run) return;
  switch (S.phase) {
    case 'idle': if (!stock.present) loadPipe(); else nextPieceOrEject(); break;
    case 'load': { const k = ease(t / 1.2); stock.g.position.z = lerp(260, 0, k); stock.g.position.y = Y0 + Math.sin(k * Math.PI) * 60; if (t > 1.4) nextPieceOrEject(); break; }
    case 'feed': S.clampA = Math.max(0, S.clampA - dt * 4); S.clampB = Math.max(0, S.clampB - dt * 4); if (t > .2) { const k = ease((t - .2) / feedDur); stock.front = lerp(feedFrom, feedTo, k); if (k >= 1) setPhase('clamp'); } break;
    case 'clamp': S.clampA = Math.min(1, S.clampA + dt * 4); S.clampB = Math.min(1, S.clampB + dt * 4); if (t > .35) setPhase('chamfer'); break;
    case 'chamfer': { const T = .7 + P.rad * .25; const k = t < .3 ? ease(t / .3) : t > T - .3 ? 1 - ease((t - (T - .3)) / .3) : 1; S.chX = k; if (t > .3 && t < T - .3) { const nf = P.rad * clamp((t - .3) / (T - .6)); if (Math.abs(nf - stock.fR) > .04) { stock.fR = nf; rebuildStock(); } } if (t >= T) { stock.fR = P.rad; rebuildStock(); S.chX = 0; setPhase('mark'); curList = tickList(); stock.markMesh.visible = true; } break; }
    case 'mark': { const T = .25 + curList.length * .011; const idx = Math.floor((t - .1) / (T - .2) * curList.length); if (idx >= 0) drawTicks(stock.mark, idx, curList); S.laserIdx = idx < curList.length ? idx : -1; if (t >= T) { drawTicks(stock.mark, 999, curList); S.laserIdx = -1; setPhase('cut'); } break; }
    case 'cut': { const T = (P.cut === 'saw' ? 1.2 : 1.8) * MATS[P.mat].cut * (P.dia / 20) ** .5; const k = t < T * .8 ? ease(t / (T * .8)) : 1 - ease((t - T * .8) / (T * .2)); S.sawY = k; if (t >= T) { S.sawY = 0; setPhase('release'); doCut(); } break; }
    case 'release': S.clampB = Math.max(0, S.clampB - dt * 5); if (t > .25) nextPieceOrEject(); break;
  }
}
// ---------- visuals per frame ----------
const wv = new THREE.Vector3();
function visuals(dt, now) {
  const R = P.dia / 2; const ph = S.phase;
  stock.g.visible = stock.present; if (stock.present) { stock.g.position.x = stock.front; }
  // explode
  if (expTarget !== null) { EXP += (expTarget - EXP) * Math.min(1, dt * 4); if (Math.abs(expTarget - EXP) < .002) { EXP = expTarget; expTarget = null; } $('sExp').value = EXP; $('vExp').textContent = Math.round(EXP * 100) + '%'; }
  for (const id of partOrder) { const p = parts[id]; p.g.position.copy(p.base).addScaledVector(p.dir, EXP); }
  // clamps
  clampA.jaws.forEach(j => j.position.z = j.userData.s * (R + 15 + (1 - S.clampA) * 14 + EXP * 120) - 0 * j.userData.s);
  clampB.jaws.forEach(j => j.position.z = j.userData.s * (R + 15 + (1 - S.clampB) * 14 + EXP * 120));
  clampA.jaws.forEach(j => j.position.z -= 0); 
  vRollers.forEach(v => v.position.y = Y0 - R * 1.25 - 6);
  supV.position.y = Y0 - R; supV.position.x = 55;
  wheelArm.position.y = Y0 + R + 22; wheelSpokes.rotation.z = -(stock.front - (stock.L ? 0 : 0)) / 22; wheel.rotation.y = 0;
  const tail = stock.present ? stock.front - stock.L : -1450; carriage.position.x = clamp(tail - 8, -1420, 40) + (stock.present && ph === 'load' ? -30 : 0);
  // chamfer slide
  const chWork = stock.present ? stock.front - (205 - 20) : -85; chSlide.position.x = lerp(70, Math.min(70, chWork + 2), S.chX); chSpin.rotation.x += (S.chX > .9 ? 40 : 0) * dt;
  chSpin.scale.setScalar(clamp(R / 10 * .9 + .1, .6, 2.2)); chSpin.scale.x = 1;
  // saw
  const sawUp = Y0 + R + 70 + 25, sawDn = Y0 - R - 8 + 70; sawArm.position.y = lerp(sawUp, sawDn, S.sawY); sawArm.position.x = 0;
  blade.rotation.x -= (ph === 'cut' ? (P.cut === 'saw' ? 60 : 25) : 2) * dt; bladeDisk.scale.y = P.cut === 'saw' ? 1 : 2.5;
  // chips/sparks
  chips.visible = ph === 'cut' && S.sawY > .3; sparkGlow.visible = chips.visible && P.cut === 'saw'; sparkGlow.position.set(0, Y0, P.dia / 2 + 4); sparkGlow.material.opacity = .5 + Math.random() * .5; if (chips.visible) { const a = chips.geometry.attributes.position; for (let i = 0; i < chipV.length; i++) { const p = new THREE.Vector3(a.getX(i), a.getY(i), a.getZ(i)); chipV[i].y -= 600 * dt; p.addScaledVector(chipV[i], dt); if (p.y < Y0 - 200 || Math.random() < .03) { p.set(0, Y0 - R * .2, R); chipV[i].set((Math.random() - .5) * 120, Math.random() * 200, 150 + Math.random() * 250); } a.setXYZ(i, p.x, p.y, p.z); } a.needsUpdate = true; chips.material.color.set(P.cut === 'saw' ? 0xffb24a : 0xcfd4da); }
  // laser
  const li = S.laserIdx; beam.visible = !!(ph === 'mark' && li >= 0 && curList[li]); glow.visible = beam.visible; spot.intensity = 0;
  if (beam.visible) { const mm = curList[li][0]; const x = stock.front - mm; const top = new THREE.Vector3(55 + parts.laser.g.position.x - parts.laser.base.x, Y0 + 140 + parts.laser.g.position.y - parts.laser.base.y, 0); const bot = new THREE.Vector3(x, Y0 + R, 0); beam.position.copy(top).add(bot).multiplyScalar(.5); beam.scale.y = top.distanceTo(bot); beam.lookAt(bot); beam.rotateX(Math.PI / 2); spot.position.copy(bot).y += 6; glow.position.copy(bot).y += 1; glow.material.opacity = .7 + Math.random() * .3; spot.intensity = 3000 * (0.6 + Math.random() * .4); beam.material.opacity = .5 + Math.random() * .5; }
  // lamps
  const st = S.estop || S.safety ? 'r' : S.run ? 'g' : 'a'; for (const k in lamps) lamps[k].material.emissiveIntensity = k === st ? (k === 'r' ? (Math.sin(now * 8) > 0 ? 2.5 : .3) : 2.2) : .05;
  curBeams.forEach(b => b.material.opacity = hand.visible ? (Math.sin(now * 10) > 0 ? .9 : .2) : .35);
  // gauge beams
  gaugeBeams.forEach(b => b.visible = false);
  // pieces animation
  for (let i = pieces.length - 1; i >= 0; i--) { const p = pieces[i]; p.t += dt * P.sim; const g = p.g; const t = p.t;
    if (p.kind === 'scrap') { const k = clamp(t / 1.6); const z = binZ.scrap; const a = p.from; const tx = BIN_X, ty = BIN_Y + 15 + (S.scrap % 4) * 4 * 0; g.position.set(lerp(a.x, tx + (a.x > tx ? 0 : 0), ease(k)), lerp(a.y, ty, k * k) + Math.sin(k * Math.PI) * 200, lerp(a.z, z, ease(k))); g.rotation.y = k * .6; if (t > 1.6) { p.done = true; } }
    else if (!p.done) {
      const gy = (x) => CH0.y + (x - CH0.x) * Math.tan(chAng) + R + 4;
      if (t < .35) { const k = t / .35; g.position.set(100, lerp(Y0, gy(100), k * k), 0); g.rotation.z = chAng * k; }
      else if (t < 1.1) { const k = ease((t - .35) / .75); const x = lerp(100, GX + 50, k); g.position.set(x, gy(x), 0); g.rotation.z = chAng; g.rotation.x -= dt * 6 * P.sim; }
      else if (t < 1.7) { const x = GX + 50; g.position.set(x, gy(x), 0); gaugeBeams.forEach((b, j) => { const bx = x + (j ? 0 : -100); b.visible = true; b.position.set(bx, gy(x) + 50, -10); b.scale.y = 100; }); if (!p.shown) { p.shown = true; } }
      else if (t < 2.8) { const k = (t - 1.7) / 1.1; const x0 = GX + 50; const tx = BIN_X + 10, tz = binZ[p.bin]; const n = (p.bin === 'ok' ? S.n : S.rej) % 12; const ty = BIN_Y + 4 + R + (n % 3) * P.dia; g.position.set(lerp(x0, tx, ease(k)), lerp(gy(x0), ty, k * k), lerp(0, tz + ((n / 3 | 0) - 1.5) * P.dia * 1.05, ease(k))); g.rotation.z = lerp(chAng, 0, k); flap.rotation.x = (p.bin === 'ok' ? -.5 : .5) * Math.sin(k * Math.PI); }
      else p.done = true;
    }
  }
  while (pieces.length > 40) { const p = pieces.shift(); scene.remove(p.g); }
  // follow cam
  if (FOLLOW && !camTw) { controls.target.lerp(wv.set(50, Y0, 0), .05); }
}
// ---------- HUD ----------
function hud() {
  const st = $('hState'); st.className = 'st' + (S.estop || S.safety ? ' err' : !S.run ? ' warn' : '');
  $('hStateT').textContent = S.estop ? PH.estop : S.safety ? PH.safety : (S.run ? PH[S.phase] : (S.phase === 'idle' && !S.total ? 'מוכן – לחץ ▶ הפעל' : 'מושהה · ' + PH[S.phase]));
  $('hPcs').textContent = S.n - S.rej; $('hRem').textContent = stock.present ? fmt(stock.L, 0) + ' ממ' : '–'; $('hRej').textContent = S.rej;
  $('hLast').textContent = S.lastLen ? fmt(S.lastLen, 2) + (S.lastOk ? ' ✓' : ' ✗') : '–'; $('hLast').style.color = S.lastLen ? (S.lastOk ? '#7dff9e' : '#ff8a80') : '';
  const cyc = S.lastCycle || estCycle(); $('hCyc').textContent = fmt(cyc) + ' שנ׳'; $('hPph').textContent = Math.round(3600 / cyc);
  const tot = piecesFor(P.len).n; $('hBar').style.width = (stock.present ? clamp(S.piecesThisPipe / Math.max(1, tot)) * 100 : 0) + '%';
}

// ---------- loop ----------
let composer = null, gtao = null;
function setupPost() {
  if (composer) { composer.dispose?.(); composer = null; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, HIGH ? 2 : 1.25)); renderer.shadowMap.enabled = true;
  sun.shadow.mapSize.set(HIGH ? 4096 : 1024, HIGH ? 4096 : 1024); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  if (!HIGH) return;
  const pr = renderer.getPixelRatio(); const rt = new THREE.WebGLRenderTarget(innerWidth * pr, innerHeight * pr, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, rt); composer.addPass(new RenderPass(scene, camera));
  gtao = new GTAOPass(scene, camera, innerWidth, innerHeight); gtao.updateGtaoMaterial({ radius: 70, distanceExponent: 1.5, thickness: 8, scale: 1.1, samples: 16 }); gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 8, rings: 2, samples: 16 }); gtao.blendIntensity = .9; composer.addPass(gtao);
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .3, .3, 1.6)); composer.addPass(new OutputPass());
  composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight);
}
function setQuality(h, user) { HIGH = h; if (user) localStorage.setItem('pcs_q', h ? 'high' : 'low'); setupPost(); $('bQ').textContent = '⚙ איכות: ' + (HIGH ? 'גבוהה' : 'נמוכה'); $('bQ').classList.toggle('on', HIGH); }
function resize() { IS_MOBILE = layout(); renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.fov = camera.aspect < .8 ? 50 : 34; camera.updateProjectionMatrix(); if (composer) composer.setSize(innerWidth, innerHeight); }
addEventListener('resize', resize); resize(); setQuality(HIGH); $('bQ').onclick = () => setQuality(!HIGH, true);
let fpsAcc = 0, fpsN = 0, fpsChecked = false;
let last = performance.now(), hudT = 0;
function frame(nowMs) {
  const dtR = Math.min(.05, (nowMs - last) / 1000); last = nowMs; const now = nowMs / 1000;
  if (!S.estop) step(dtR * P.sim);
  visuals(dtR, now);
  if (camTw) { camTw.k = Math.min(1, camTw.k + dtR / camTw.dur); const k = ease(camTw.k); camera.position.lerpVectors(camTw.p0, camTw.p1, k); controls.target.lerpVectors(camTw.t0, camTw.t1, k); if (camTw.k >= 1) camTw = null; }
  controls.update(); updDetails(now); if (composer) composer.render(); else renderer.render(scene, camera); updLabels();
  if (HIGH && !fpsChecked && !QP0 && !localStorage.getItem('pcs_q')) { fpsAcc += dtR; fpsN++; if (fpsAcc > 4) { fpsChecked = true; if (fpsN / fpsAcc < 24) { setQuality(false); toast('הוחלף לאיכות נמוכה לשמירה על חלקות (אפשר להחליף ב⚙)'); } } }
  hudT += dtR; if (hudT > .15) { hudT = 0; hud(); }
  requestAnimationFrame(frame);
}
controls.addEventListener('start', () => { camTw = null; });
syncUI(); loadPipe(); S.run = new URLSearchParams(location.search).has('paused') ? false : true;
const qp = new URLSearchParams(location.search); if (qp.has('x')) { XRAY = true; $('bX').classList.add('on'); applyLook(); } if (qp.has('e')) { EXP = +qp.get('e'); }
if (qp.has('st')) setTimeout(() => showStation(+qp.get('st')), 50);
if (qp.has('cam')) { const c = qp.get('cam').split(',').map(Number); camera.position.set(c[0], c[1], c[2]); controls.target.set(c[3], c[4], c[5]); }
requestAnimationFrame(frame);
window.__ff = (sec) => { for (let i = 0; i < sec * 50; i++) { step(.02); visuals(.02, i * .02); } }; window.__S = S; window.__P = P;
if (qp.has('hide')) for (const id of qp.get('hide').split(',')) if (parts[id]) parts[id].g.visible = false;
if (qp.has('nolabels')) $('labels').style.visibility = 'hidden';
