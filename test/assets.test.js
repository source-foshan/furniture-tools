import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('the widget runs the same CBM code as the API', () => {
  execFileSync(process.execPath, [new URL('../scripts/build-assets.mjs', import.meta.url).pathname]);
  const core = read('src/core/cbm.js');
  const copy = read('public/embed/cbm-core.js');
  assert.ok(copy.startsWith('// GENERATED'));
  assert.equal(copy.slice(copy.indexOf('\n') + 1), core);
});

test('embed pages have no inline scripts or styles (they would break the CSP)', () => {
  for (const file of readdirSync(new URL('../public/embed/', import.meta.url)).filter((f) => f.endsWith('.html')).map((f) => 'public/embed/' + f).concat('public/widgets.html')) {
    const html = read(file);
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/, `${file} has an inline <script>`);
    assert.doesNotMatch(html, /\sstyle=/, `${file} has an inline style attribute`);
    assert.doesNotMatch(html, /\son[a-z]+=/, `${file} has an inline event handler`);
  }
});

test('embed code on the widgets page matches the loader tool names', () => {
  const page = read('public/widgets.html');
  const loader = read('public/widget.js');
  for (const tool of ['cbm', 'hs-code']) {
    assert.match(page, new RegExp(`data-sourcefoshan-tool="${tool}"`));
    assert.match(loader, new RegExp(`'${tool}': \\{ path: '/embed/${tool}'`));
  }
});
