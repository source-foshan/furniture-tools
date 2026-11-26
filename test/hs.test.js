import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { findHsCode, hsFilters, HS_CATEGORIES, HS_MATERIALS, HS_DATASET } from '../src/core/hs.js';
import { InputError } from '../src/core/cbm.js';

const require = createRequire(import.meta.url);
const finder = require('../src/vendor/hs-finder.cjs');
const data = JSON.parse(readFileSync(new URL('../src/vendor/hs-data.json', import.meta.url)));
const guidance = JSON.parse(readFileSync(new URL('../src/vendor/hs-guidance.json', import.meta.url)));

const QUERIES = ['', 'wooden dining table', 'office chair', 'sofa', '沙发', '木餐桌', 'mattress', '9403.60', '9401',
  'gas lift', 'car seat', 'rattan chair', 'kitchen cabinet', 'bed', 'wardrobe with mirror', 'chair legs', 'zzzz',
  'metal bed frame', 'bean bag', 'sofa bed', 'barber chair', 'pillow', 'desk', 'outdoor', '9403601000'];

test('API returns exactly what the website finder returns (codes and order)', () => {
  for (const q of QUERIES) {
    for (const state of [{ q }, { q, category: 'seating' }, { q, material: 'wood' }]) {
      const site = finder.search(data.rows, { q: state.q, category: state.category || '', material: state.material || '' }, guidance).map((r) => r.code);
      const api = findHsCode({ ...state, limit: 36 });
      assert.deepEqual(api.results.map((r) => r.code), site, JSON.stringify(state));
      assert.equal(api.total, site.length);
      assert.deepEqual(api.guidance, finder.guidanceFor(state.q, guidance, site.length), JSON.stringify(state));
    }
  }
});

test('typical queries in English, Chinese and by code', () => {
  assert.equal(findHsCode({ q: 'wooden dining table' }).results[0].code, '9403.60');
  assert.equal(findHsCode({ q: '木餐桌' }).results[0].code, '9403.60');
  assert.equal(findHsCode({ q: '9403.60' }).results[0].code, '9403.60');
  assert.equal(findHsCode({ q: '940360' }).results[0].code, '9403.60');
  assert.deepEqual(findHsCode({ q: 'mattress' }).results.map((r) => r.code), ['9404.21', '9404.29']);
  const sofa = findHsCode({ q: '沙发' });
  assert.ok(sofa.total > 1 && sofa.results.every((r) => r.heading === '9401'));
});

test('out-of-scope items return no codes and say why', () => {
  const r = findHsCode({ q: 'gas lift' });
  assert.equal(r.total, 0);
  assert.equal(r.out_of_scope, true);
  assert.equal(r.guidance[0].title, 'Outside this furniture table.');
});

test('national 10-digit codes get the six-digit hint', () => {
  const r = findHsCode({ q: '9403601000' });
  assert.equal(r.total, 0);
  assert.match(r.guidance[0].message, /six-digit/);
});

test('limit, filters and validation', () => {
  assert.equal(findHsCode({}).returned, 10);
  assert.equal(findHsCode({}).total, HS_DATASET.codes);
  assert.equal(findHsCode({ limit: 36 }).returned, 36);
  assert.equal(findHsCode({ q: 'sofa', limit: 2 }).results.length, 2);
  assert.ok(findHsCode({ category: 'bedding', limit: 36 }).results.every((r) => r.heading === '9404'));
  assert.ok(findHsCode({ category: 'SEATING' }).total > 0, 'category is case-insensitive');
  assert.throws(() => findHsCode({ category: 'toys' }), InputError);
  assert.throws(() => findHsCode({ material: 'gold' }), InputError);
  assert.throws(() => findHsCode({ limit: 0 }), InputError);
  assert.throws(() => findHsCode({ limit: 37 }), InputError);
  assert.throws(() => findHsCode({ limit: 'many' }), InputError);
  assert.equal(findHsCode({ q: 'x'.repeat(500) }).query.q.length, 180);
  assert.deepEqual(hsFilters().categories.map((c) => c.value), HS_CATEGORIES);
  assert.ok(HS_MATERIALS.includes('wood'));
});

test('every result links back to the site with UTM tags and the code anchor', () => {
  const api = findHsCode({ q: 'chair', limit: 36 });
  for (const r of api.results) {
    const url = new URL(r.url);
    assert.equal(url.origin, 'https://sourcefoshan.com');
    assert.equal(url.searchParams.get('utm_source'), 'sourcefoshan-api');
    assert.equal(url.hash, '#hs-' + r.code_digits);
  }
  const mcp = findHsCode({ q: 'chair' }, 'mcp');
  assert.equal(new URL(mcp.finder_url).searchParams.get('utm_medium'), 'mcp');
  assert.equal(new URL(mcp.finder_url).searchParams.get('q'), 'chair');
  assert.match(api.disclaimer, /Reference only/);
});
