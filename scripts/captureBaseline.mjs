// Baseline capture: boot the app, wait for environment ready, capture showcase + zoomed views.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173/';
const OUT = process.env.SHOT_DIR ?? 'shots/stage0-baseline';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=gl-egl', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--enable-gpu'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('[console.error]', msg.text().slice(0, 300));
});
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.documentElement.dataset.environmentReady === 'true', null, { timeout: 120000 })
  .catch(async () => console.log('WARN environmentReady:', await page.evaluate(() => document.documentElement.dataset.environmentReady)));

// wait a few frames for shadow fit + grass
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/01-overview.png` });

// zoom in close to the ground (road-scale detail)
for (let i = 0; i < 8; i++) await page.mouse.wheel(0, -400);
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/02-zoom-ground.png` });

// hide UI for a clean art shot
await page.evaluate(() => document.body.classList.add('hide-ui'));
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/03-no-ui-overview.png` });
await page.evaluate(() => document.body.classList.remove('hide-ui'));

console.log('ready state:', await page.evaluate(() => document.documentElement.dataset.environmentReady));
console.log('shots saved to', OUT);
await browser.close();
