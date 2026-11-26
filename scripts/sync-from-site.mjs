// Pulls the HS finder search core, its reference data and the consolidation
// calculator logic from the live sourcefoshan.com pages, so the API answers
// exactly what the website answers. Run: npm run sync
import { writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SITE = 'https://sourcefoshan.com';
export const HS_PAGE = `${SITE}/resources/furniture-hs-code-finder/`;
export const CALC_PAGE = `${SITE}/furniture-shipping-and-consolidation-from-china/`;

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'sourcefoshan-tools-sync/1.0' } });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return res.text();
}

function jsonScript(html, id) {
  const m = html.match(new RegExp(`<script[^>]*id="${id}"[^>]*>([\\s\\S]*?)</script>`));
  if (!m) throw new Error(`Missing <script id="${id}">`);
  return JSON.parse(m[1]);
}

export async function fetchSiteSources() {
  const hsHtml = await get(HS_PAGE);
  const finderMatch = hsHtml.match(/src="([^"]*\/assets\/hs-finder\/finder\.[a-f0-9]+\.js)"/);
  if (!finderMatch) throw new Error('HS finder script not found on the page');
  const finderUrl = new URL(finderMatch[1], SITE).href;
  const finderJs = await get(finderUrl);
  const data = jsonScript(hsHtml, 'sf-hs-data');
  const guidance = jsonScript(hsHtml, 'sf-hs-guidance-data');

  const calcHtml = await get(CALC_PAGE);
  const calcScript = [...calcHtml.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1])
    .find((s) => s.includes("getElementById('sf-consol-calc')"));
  if (!calcScript) throw new Error('Consolidation calculator script not found on the page');

  return { finderUrl, finderJs, data, guidance, calcScript };
}

async function main() {
  const src = await fetchSiteSources();
  if (!Array.isArray(src.data.rows) || !src.data.rows.length) throw new Error('HS data has no rows');
  await mkdir(path.join(ROOT, 'src/vendor'), { recursive: true });
  await mkdir(path.join(ROOT, 'test/fixtures'), { recursive: true });
  // .cjs keeps the site's UMD file byte-for-byte while letting Node and esbuild load it as CommonJS.
  await writeFile(path.join(ROOT, 'src/vendor/hs-finder.cjs'), src.finderJs);
  await writeFile(path.join(ROOT, 'src/vendor/hs-data.json'), JSON.stringify(src.data, null, 1) + '\n');
  await writeFile(path.join(ROOT, 'src/vendor/hs-guidance.json'), JSON.stringify(src.guidance, null, 1) + '\n');
  await writeFile(path.join(ROOT, 'test/fixtures/site-consol-calc.js'), src.calcScript);
  const manifest = {
    syncedAt: new Date().toISOString(),
    hsPage: HS_PAGE,
    calculatorPage: CALC_PAGE,
    finderUrl: src.finderUrl,
    finderSha256: sha256(src.finderJs),
    dataSha256: sha256(JSON.stringify(src.data)),
    guidanceSha256: sha256(JSON.stringify(src.guidance)),
    calculatorSha256: sha256(src.calcScript),
    edition: src.data.meta?.edition,
    verificationDate: src.data.meta?.verificationDate,
    rows: src.data.rows.length
  };
  await writeFile(path.join(ROOT, 'src/vendor/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Synced ${manifest.rows} HS rows (${manifest.edition}, verified ${manifest.verificationDate}) from ${src.finderUrl}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}
