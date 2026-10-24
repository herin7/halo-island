// Drives the interactive demos and screenshots each step: `node scripts/flows.mjs [url] [outDir]`.
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:4173/';
const out = process.argv[3] ?? 'shots';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url, { waitUntil: 'networkidle' });
const shot = async (name, sel) => { await page.waitForTimeout(900); await (sel ? page.locator(sel).first().screenshot({ path: `${out}/flow-${name}.png` }) : page.screenshot({ path: `${out}/flow-${name}.png` })); };

// Island OS: wallet → ₹500 → buy (confirm) → paid.
await page.locator('#os').scrollIntoViewIfNeeded();
await page.waitForTimeout(1200);
await page.locator('.os-item', { hasText: 'Wallet' }).click();
await shot('os-wallet', '.os-phone');
await page.locator('.os-phone [role=radio]', { hasText: '₹500' }).click();
await page.locator('.os-phone button', { hasText: 'Buy' }).click();
await shot('os-confirm', '.os-phone');
await page.locator('.os-phone button', { hasText: 'Pay' }).click();
await shot('os-paid', '.os-phone');
await page.locator('.os-item', { hasText: 'Home' }).click();
await page.locator('.os-phone .hi-toggle', { hasText: 'Fan' }).click();
await shot('os-home', '.os-phone');
await page.locator('.os-item', { hasText: 'Music' }).click();
await page.locator('.os-phone button[aria-label="music:toggle"]').click();
await shot('os-music', '.os-phone');
await page.locator('.os-item', { hasText: 'Ride' }).click();
await page.locator('.os-phone button', { hasText: 'Book' }).click();
await page.waitForTimeout(2500);
await shot('os-ride', '.os-phone');
await page.locator('.os-phone button', { hasText: 'Cancel' }).click();
await page.locator('.os-phone button', { hasText: 'Cancel ride?' }).click();
await shot('os-cancelled', '.os-phone');

// Gallery: hover a card, then open the modal with code.
await page.locator('#gallery').scrollIntoViewIfNeeded();
await page.locator('.card').nth(4).hover();
await page.waitForTimeout(1500);
await shot('gallery-hover', '.gallery');
await page.locator('.card').nth(0).getByRole('button', { name: /Play/ }).click();
await page.waitForTimeout(2600);
await shot('gallery-modal');
for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
const trapped = await page.evaluate(() => !!document.activeElement?.closest('.modal'));
await page.keyboard.press('Escape');
await page.waitForTimeout(1200);
const restored = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
console.log('focus trapped:', trapped, '· restored to:', restored);

// Playground: glass off, pink accent, sleepy.
await page.locator('#playground').scrollIntoViewIfNeeded();
await page.locator('.swatch').nth(1).click();
await page.locator('.seg button', { hasText: 'solid' }).click();
await page.locator('.moods button', { hasText: 'sleepy' }).click();
await shot('playground', '.play');
console.log(errors.length ? `errors: ${errors.join(' | ')}` : 'no errors');
await browser.close();
