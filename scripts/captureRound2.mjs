// Round 2 evidence: water surface, road shoulder feather, shoreline mud.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173/';
const OUT = process.env.SHOT_DIR ?? 'shots/iter2';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=gl-egl', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--enable-gpu'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.documentElement.dataset.environmentReady === 'true', null, { timeout: 180000 })
  .catch(async () => console.log('WARN env:', await page.evaluate(() => document.documentElement.dataset.environmentReady)));
await page.waitForTimeout(2500);

const shot = async (name) => {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('shot:', name);
};
const moveAndClick = async (x, y, steps = 18) => {
  await page.mouse.move(x, y, { steps });
  await page.waitForTimeout(120);
  await page.mouse.click(x, y);
};

// build the standard network
await moveAndClick(490, 340);
await moveAndClick(690, 330);
await page.mouse.move(1090, 340, { steps: 34 });
await page.keyboard.down('Control');
await page.mouse.wheel(0, -220);
await page.keyboard.up('Control');
await moveAndClick(1090, 340, 12);
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
await moveAndClick(1090, 340);
await moveAndClick(1480, 390, 30);
await page.keyboard.press('Enter');
await page.waitForTimeout(1200);

const targets = await page.evaluate(() => {
  const db = window.__splineDebug;
  const bridges = [];
  const roads = [];
  for (const edge of db.edges()) {
    const wetCount = edge.path.filter(([x, , z]) => db.isWet(x, z)).length;
    (wetCount > 3 ? bridges : roads).push(edge);
  }
  const mid = (pts) => {
    const i = Math.floor(pts.length / 2);
    return [pts[i][0], pts[i][2]];
  };
  // find a wet point + nearest dry point on the bridge edge for shore shots
  const bridge = bridges[0];
  let wetP = null, dryP = null;
  if (bridge) {
    for (const [x, , z] of bridge.path) {
      if (db.isWet(x, z)) wetP = wetP ?? [x, z];
      else if (wetP) { dryP = [x, z]; break; }
    }
  }
  return {
    bridge: bridge ? mid(bridge.path) : null,
    shore: wetP && dryP ? [ (wetP[0]+dryP[0])/2, (wetP[1]+dryP[1])/2 ] : null,
    road: roads[0] ? mid(roads[0].path) : null,
  };
});
console.log('targets:', JSON.stringify(targets));
await page.evaluate(() => document.body.classList.add('hide-ui'));
const frame = async (x, z, yaw, pitch, dist) => {
  await page.evaluate(([fx, fz, fy, fp, fd]) => window.__splineDebug.frame(fx, fz, fy, fp, fd), [x, z, yaw, pitch, dist]);
};

if (targets.bridge) {
  await frame(targets.bridge[0], targets.bridge[1], -35, 22, 55);
  await shot('water-bridge-mid');
}
if (targets.shore) {
  await frame(targets.shore[0], targets.shore[1], -40, 25, 16);
  await shot('shore-mud-close');
}
if (targets.road) {
  await frame(targets.road[0], targets.road[1], -38, 30, 18);
  await shot('road-shoulder-close');
}
// open river water mid-zoom
if (targets.shore) {
  await frame(targets.shore[0], targets.shore[1] - 12, -40, 20, 60);
  await shot('river-water-mid');
}
await browser.close();
