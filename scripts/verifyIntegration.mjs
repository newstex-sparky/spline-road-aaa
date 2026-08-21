// Quick integration verification: overview + ground zoom after grass/UI changes.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173/';
const OUT = process.env.SHOT_DIR ?? 'shots/iter1-integration';
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
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('shot:', name);
};

await shot('01-ui-hud');
await page.evaluate(() => document.body.classList.add('hide-ui'));
await page.waitForTimeout(600);
await shot('02-hide-ui');
await page.evaluate(() => document.body.classList.remove('hide-ui'));

// zoom toward ground for grass detail
for (let i = 0; i < 10; i++) await page.mouse.wheel(0, -400);
await page.waitForTimeout(1500);
await shot('03-ground-grass');
await browser.close();
