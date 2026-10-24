// Every gallery card, hovered open mid-story: `bun run preview`, then `node scripts/cards.mjs [url] [outDir]`.
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:4173/';
const out = process.argv[3] ?? 'shots';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
await page.goto(url + '#gallery', { waitUntil: 'networkidle' });
const cards = page.locator('.gallery article.card');
const n = await cards.count();
for (let i = 0; i < n; i++) {
  const card = cards.nth(i);
  await card.scrollIntoViewIfNeeded();
  await card.hover();
  await page.waitForTimeout(3200);
  const name = (await card.locator('h3').innerText()).split('\n')[0].trim().toLowerCase().replace(/\W+/g, '-');
  await card.screenshot({ path: `${out}/card-${String(i).padStart(2, '0')}-${name}.png` });
  await page.mouse.move(5, 5);
  await page.waitForTimeout(300);
}
console.log('cards', n);
await browser.close();
