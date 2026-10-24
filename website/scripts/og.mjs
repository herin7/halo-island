// Renders public/og.jpg (1200x630) and public/apple-touch-icon.png from the live hero: `bun run preview` first.
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:4173/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.emulateMedia({ reducedMotion: 'no-preference' });
await page.goto(url, { waitUntil: 'networkidle' });
await page.addStyleTag({ content: '.ticker, .nav-links a:not(.nav-gh), .cta-row { display: none !important } .hero-body { padding-top: 250px !important } .hero h1 { font-size: 112px !important }' });
await page.locator('.ticker button').first().evaluate((b) => b.click());
await page.waitForTimeout(5200);
await page.screenshot({ path: 'public/og.jpg', type: 'jpeg', quality: 88 });
const icon = await browser.newPage({ viewport: { width: 180, height: 180 } });
await icon.setContent(`<body style="margin:0;background:#050506"><img src="${new URL('favicon.svg', url).href}" width="180" height="180"></body>`);
await icon.waitForTimeout(300);
await icon.screenshot({ path: 'public/apple-touch-icon.png' });
await browser.close();
