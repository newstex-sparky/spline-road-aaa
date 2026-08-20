// Stage driver: builds a representative road network + residences, then captures
// beauty shots per subsystem. Mirrors the author's showcase interaction sequence.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173/';
const OUT = process.env.SHOT_DIR ?? 'shots/scene';
const LABEL = process.env.SHOT_LABEL ?? '';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=gl-egl', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--enable-gpu'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('[console.error]', msg.text().slice(0, 200));
});

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.documentElement.dataset.environmentReady === 'true', null, { timeout: 180000 })
  .catch(async () => console.log('WARN env:', await page.evaluate(() => document.documentElement.dataset.environmentReady)));
await page.waitForTimeout(2500);

const shot = async (name) => {
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${LABEL ? `${LABEL}-` : ''}${name}.png` });
  console.log('shot:', name);
};

const moveAndClick = async (x, y, steps = 18) => {
  await page.mouse.move(x, y, { steps });
  await page.waitForTimeout(120);
  await page.mouse.click(x, y);
};
const wheelBurst = async (deltaY, count, gapMs = 105) => {
  for (let i = 0; i < count; i += 1) {
    await page.mouse.wheel(0, deltaY);
    await page.waitForTimeout(gapMs);
  }
};

// ---- Scene: roads + bridge (mirrors author showcase route) ----
const mode = async () => (await page.locator('[data-mode]').textContent().catch(() => '')).trim();
const ensureTool = async (name) => {
  const m = await mode();
  const targetActive = name === 'road' ? 'ROAD TOOL ACTIVE' : 'HOUSE PLACEMENT ACTIVE';
  if (m === targetActive) return;
  await page.getByRole('button', { name: name === 'road' ? 'Toggle road tool' : 'Toggle house placement mode', exact: true }).click().catch(() => {});
  await page.waitForTimeout(200);
};

await ensureTool('road');
await shot('00-before-build');
await moveAndClick(490, 340);
await moveAndClick(690, 330);
await page.mouse.move(1090, 340, { steps: 34 });
await page.keyboard.down('Control');
await page.mouse.wheel(0, -220);
await page.keyboard.up('Control');
await shot('02-route-curved');
await moveAndClick(1090, 340, 12);
await page.keyboard.press('Enter');
await page.waitForTimeout(1800);
await shot('03-bridge-built');

// branch road from bridge endpoint
await moveAndClick(1090, 340);
await moveAndClick(1480, 390, 30);
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);

// junction branch onto segment
await moveAndClick(1190, 365);
await moveAndClick(1260, 135, 30);
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
await shot('04-network-junctions');

// ---- residences (debug-assisted: along-edge sampling, same side, valid depth) ----
await ensureTool('residence');
const status = async () => (await page.locator('[data-status]').textContent().catch(() => '')).trim();

// zoom in toward construction detail for click accuracy
await wheelBurst(-90, 6, 115);
await page.waitForTimeout(800);

const frontagePlan = await page.evaluate(() => {
  const db = window.__splineDebug;
  const isPolyDry = (pts) => {
    // bounding box grid at ~2.4 m (matches ResidenceSystem.validatePlacement)
    const xs = pts.map((p) => p[0]);
    const zs = pts.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minZ = Math.min(...zs), maxZ = Math.max(...zs);
    // point-in-quad test via convex check: sample a fine grid
    for (let x = minX; x <= maxX; x += 2.4) {
      for (let z = minZ; z <= maxZ; z += 2.4) {
        if (db.isWet(x, z)) return false;
      }
    }
    return true;
  };
  // Score edges: straightness + dry zone; keep the straightest DRY one.
  let bestEdge = null;
  let bestScore = Infinity;
  for (const edge of db.edges()) {
    if (edge.path.length < 8) continue;
    const [x0, , z0] = edge.path[0];
    const [x1, , z1] = edge.path[edge.path.length - 1];
    const chord = Math.hypot(x1 - x0, z1 - z0);
    if (chord < 18) continue;
    let maxDev = 0;
    for (const [x, , z] of edge.path) {
      const d = Math.abs((x1 - x0) * (z0 - z) - (x0 - x) * (z1 - z0)) / chord;
      maxDev = Math.max(maxDev, d);
    }
    const score = maxDev / chord;
    if (score >= bestScore) continue;
    const path = edge.path;
    const lerp = (t) => {
      const idx = Math.min(path.length - 2, Math.floor(t * (path.length - 1)));
      const f = t * (path.length - 1) - idx;
      const [px, , pz] = path[idx];
      const [qx, , qz] = path[idx + 1];
      return [px + (qx - px) * f, pz + (qz - pz) * f];
    };
    const [ax, az] = lerp(0.35);
    const [bx, bz] = lerp(0.65);
    let dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    const side = 1;
    const nx = -dz * side;
    const nz = dx * side;
    const pts = (t, offset) => {
      const [x, z] = lerp(t);
      return [x + nx * offset, z + nz * offset];
    };
    const frontA = pts(0.22, 7.5);
    const frontB = pts(0.62, 7.5);
    // rear corners via frontage perpendicular (same as driver's later step)
    const [fax, faz] = frontA;
    const [fbx, fbz] = frontB;
    const fdx = fbx - fax;
    const fdz = fbz - faz;
    const flen = Math.hypot(fdx, fdz) || 1;
    const s2 = side;
    const rnx = (-fdz / flen) * s2;
    const rnz = (fdx / flen) * s2;
    const rearA = [fax + rnx * 18, faz + rnz * 18];
    const rearB = [fbx + rnx * 18, fbz + rnz * 18];
    const quad = [frontA, frontB, rearB, rearA];
    if (!isPolyDry(quad)) continue;
    const all = [frontA, frontB, ...quad];
    let outOfBounds = false;
    for (const [x, z] of all) {
      if (Math.abs(x) > 190 || Math.abs(z) > 190) { outOfBounds = true; break; }
    }
    if (outOfBounds) continue;
    bestScore = score;
    bestEdge = { frontA, frontB, rearA, rearB, edgeId: edge.id, straightness: score };
  }
  return bestEdge;
});
console.log('frontage plan:', JSON.stringify(frontagePlan));

if (frontagePlan) {
  const clickAt = async ([x, z]) => {
    const screen = await page.evaluate(([wx, wz]) => window.__splineDebug.project(wx, wz), [x, z]);
    if (!screen) throw new Error('point off screen');
    await page.mouse.move(screen.x, screen.y, { steps: 24 });
    await page.waitForTimeout(140);
    await page.mouse.click(screen.x, screen.y);
    await page.waitForTimeout(300);
  };
  await clickAt(frontagePlan.frontA);
  console.log('after frontage A:', await status());
  await clickAt(frontagePlan.frontB);
  console.log('after frontage B:', await status());

  // Compute rear corners from the SNAPPED frontage points (exact tool state):
  // offset 18 m along the frontage-perpendicular, mirrored so the parcel is a
  // clean rectangle/quadrilateral.
  const rear = await page.evaluate(() => {
    const draft = window.__splineDebug.residenceDraft();
    if (!draft || draft.frontagePoints.length < 2) return null;
    const [ax, , az] = draft.frontagePoints[0];
    const [bx, , bz] = draft.frontagePoints[1];
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz) || 1;
    // away-from-road normal = roadPerpendicular(tangent) * lockedSide:
    // tangent = (dx, dz)/len; perp = (-dz, dx)/len; side flips toward plot side.
    const side = draft.lockedSide ?? 1;
    const nx = (-dz / len) * side;
    const nz = (dx / len) * side;
    const depth = 18;
    return {
      rearA: [ax + nx * depth, az + nz * depth],
      rearB: [bx + nx * depth, bz + nz * depth],
    };
  });
  console.log('rear plan:', JSON.stringify(rear));
  if (rear) {
    // Corner order must be frontA → frontB → rearB → rearA (convex quad).
    // Click the corner paired with frontB FIRST, then the one paired with frontA.
    await clickAt(rear.rearB);
    console.log('after rear B:', await status());
    await clickAt(rear.rearA);
    console.log('after rear A:', await status());
  }
  await shot('05a-plot-draft');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  console.log('after commit:', await status());
} else {
  console.log('WARN: no valid frontage plan — skipping residences');
}
await shot('05-residences');

// ---- camera: overview ----
await wheelBurst(90, 5, 130);
await page.waitForTimeout(1200);
await shot('06-overview-full');

// ---- camera: close ground detail ----
await wheelBurst(-90, 10, 100);
await page.waitForTimeout(1200);
await shot('07-ground-close');

// ---- beauty shots: hide UI ----
await page.evaluate(() => document.body.classList.add('hide-ui'));
await page.waitForTimeout(600);
await shot('08-beauty-no-ui');
await page.evaluate(() => document.body.classList.remove('hide-ui'));

// FPS + counts for the record
const stats = await page.evaluate(() => {
  const db = window.__splineDebug;
  if (db) return { ...db.stats(), uiFps: document.querySelector('[data-fps]')?.textContent ?? '' };
  return {
    fps: document.querySelector('[data-fps]')?.textContent,
    zoom: document.querySelector('[data-zoom]')?.textContent,
    roads: document.querySelector('[data-road-count]')?.textContent,
    bridges: document.querySelector('[data-bridge-count]')?.textContent,
    residences: document.querySelector('[data-residence-count]')?.textContent,
    frontages: document.querySelector('[data-frontage-count]')?.textContent,
  };
});
console.log('stats:', JSON.stringify(stats));
await browser.close();
