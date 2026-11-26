// Checks that the vendored finder code, HS data and calculator logic still match
// the live sourcefoshan.com pages. Exit code 1 = the site changed; run `npm run sync`.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fetchSiteSources } from './sync-from-site.mjs';

const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const manifest = JSON.parse(await readFile(new URL('../src/vendor/manifest.json', import.meta.url)));
const live = await fetchSiteSources();

const checks = [
  ['finder code', manifest.finderSha256, sha256(live.finderJs)],
  ['HS data', manifest.dataSha256, sha256(JSON.stringify(live.data))],
  ['HS guidance', manifest.guidanceSha256, sha256(JSON.stringify(live.guidance))],
  ['consolidation calculator', manifest.calculatorSha256, sha256(live.calcScript)]
];
let drift = false;
for (const [name, vendored, current] of checks) {
  const same = vendored === current;
  drift ||= !same;
  console.log(`${same ? 'OK   ' : 'DRIFT'} ${name}${same ? '' : ` (vendored ${vendored.slice(0, 12)}, live ${current.slice(0, 12)})`}`);
}
console.log(drift ? '\nThe live site changed. Run `npm run sync`, then `npm test`, then deploy.' : `\nVendored copy matches the live site (synced ${manifest.syncedAt}).`);
process.exit(drift ? 1 : 0);
