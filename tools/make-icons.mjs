/* Renders tools/icon.svg to the two PNGs the manifest asks for.
   Run: node tools/make-icons.mjs   (needs playwright's chromium) */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { readFileSync, writeFileSync } from 'node:fs';

const svg = readFileSync(new URL('./icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch();
for (const size of [180, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(
    `<style>html,body{margin:0;padding:0}svg{display:block;width:${size}px;height:${size}px}</style>` + svg
  );
  const buf = await page.screenshot({ omitBackground: false });
  writeFileSync(new URL(`../icon-${size}.png`, import.meta.url), buf);
  console.log(`icon-${size}.png written`);
  await page.close();
}
await browser.close();
