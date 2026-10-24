// Screenshots of every section at desktop and phone widths: `bun run preview`, then `node scripts/shots.mjs [url] [outDir]`.
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:4173/';
const out = process.argv[3] ?? 'shots';
const sections = ['code', 'gallery', 'os', 'playground', 'surfaces', 'primitives'];

const browser = await chromium.launch();
for (const [name, viewport, mobile] of [['desktop', { width: 1440, height: 900 }, false], ['mobile', { width: 390, height: 844 }, true]]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.mouse.move(viewport.width * 0.8, viewport.height * 0.7);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/${name}-hero-a.png` });
  await page.waitForTimeout(4200);
  await page.screenshot({ path: `${out}/${name}-hero-b.png` });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  for (const id of sections) {
    await page.evaluate((id) => document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'instant' }), id);
    await page.waitForTimeout(1600);
    await page.screenshot({ path: `${out}/${name}-${id}.png` });
  }
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `${out}/${name}-footer.png` });
  console.log(name, 'horizontal overflow px:', overflow, errors.length ? `errors: ${errors.join(' | ')}` : 'no errors');
  await page.close();
}
await browser.close();
