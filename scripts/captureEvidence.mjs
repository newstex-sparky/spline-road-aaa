// Evidence capture: deterministic closeups via debug frame() for builder dispatch.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173/';
const OUT = process.env.SHOT_DIR ?? 'shots/evidence';
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

const mode = async () => (await page.locator('[data-mode]').textContent().catch(() => '')).trim();
const ensureTool = async (name) => {
  const m = await mode();
  const targetActive = name === 'road' ? 'ROAD TOOL ACTIVE' : 'HOUSE PLACEMENT ACTIVE';
  if (m === targetActive) return;
  await page.getByRole('button', { name: name === 'road' ? 'Toggle road tool' : 'Toggle house placement mode', exact: true }).click().catch(() => {});
  await page.waitForTimeout(200);
};
const moveAndClick = async (x, y, steps = 18) => {
  await page.mouse.move(x, y, { steps });
  await page.waitForTimeout(120);
  await page.mouse.click(x, y);
};

await ensureTool('road');
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

// locate bridge + road midpoints via debug bridge
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
  return {
    bridge: bridges[0] ? mid(bridges[0].path) : null,
    road: roads[0] ? mid(roads[0].path) : null,
  };
});
console.log('targets:', JSON.stringify(targets));

await page.evaluate(() => document.body.classList.add('hide-ui'));
const frame = async (x, z, yaw, pitch, dist) => {
  await page.evaluate(([fx, fz, fy, fp, fd]) => window.__splineDebug.frame(fx, fz, fy, fp, fd), [x, z, yaw, pitch, dist]);
};

if (targets.bridge) {
  await frame(targets.bridge[0], targets.bridge[1], -35, 32, 30);
  await shot('bridge-deck-close');
  await frame(targets.bridge[0], targets.bridge[1], -40, 10, 55);
  await shot('bridge-railing-mid');
}
if (targets.road) {
  await frame(targets.road[0], targets.road[1], -38, 30, 22);
  await shot('road-seam-close');
  await frame(targets.road[0], targets.road[1], -38, 12, 45);
  await shot('road-network-mid');
}
await browser.close();
