// HS code lookup. The search itself is the website's own finder code
// (src/vendor/hs-finder.cjs, synced from sourcefoshan.com), run on the same data.
import finder from '../vendor/hs-finder.cjs';
import data from '../vendor/hs-data.json' with { type: 'json' };
import guidance from '../vendor/hs-guidance.json' with { type: 'json' };
import { InputError } from './cbm.js';
import { siteUrl } from './links.js';

const FINDER_PATH = '/resources/furniture-hs-code-finder/';
export const MAX_RESULTS = 36;

const index = finder.buildIndex(data.rows);
const categoryOptions = finder.options(data.rows, data.meta, 'categories');
const materialOptions = finder.options(data.rows, data.meta, 'materials');

export const HS_CATEGORIES = categoryOptions.map((o) => o.value);
export const HS_MATERIALS = materialOptions.map((o) => o.value);

export const HS_DATASET = Object.freeze({
  title: data.meta.title,
  edition: data.meta.edition,
  headings: data.meta.scope,
  verified: data.meta.verificationDate,
  codes: data.rows.length
});

export const HS_DISCLAIMER =
  'Reference only. These are international six-digit ' + data.meta.edition + ' codes for headings ' +
  data.meta.scope.join(', ') + ' (seats, furniture, medical/salon furniture and bedding). National tariff lines ' +
  '(8–10 digits) and duty rates differ by country. Confirm the final classification with your customs broker ' +
  'or the destination customs authority.';

export function hsFilters() {
  return { categories: categoryOptions, materials: materialOptions };
}

function pick(value, allowed, name) {
  const v = value == null ? '' : String(value).trim().toLowerCase();
  if (v && !allowed.includes(v)) throw new InputError(`${name} must be one of: ${allowed.join(', ')}.`);
  return v;
}

function formatRow(row, channel) {
  const digits = finder.codeDigits(row.code);
  return {
    code: finder.formatCode(row.code),
    code_digits: digits,
    heading: row.heading,
    title: row.title,
    category: row.category,
    category_key: row.categoryKey,
    examples: row.products ?? [],
    choose_when: row.condition ?? null,
    material: row.material ?? null,
    official_description: row.officialDescription ?? null,
    note: row.note ?? null,
    official_source_url: finder.safeUrl(row.sourceUrl) || null,
    url: siteUrl(FINDER_PATH, channel, 'hs-code-finder', 'hs-' + digits)
  };
}

/**
 * Search the furniture HS table exactly as the website finder does.
 * channel: 'api' | 'mcp' (used for the UTM tags on links back to the site).
 */
export function findHsCode({ q = '', category = '', material = '', limit = 10 } = {}, channel = 'api') {
  const query = String(q ?? '').trim().slice(0, 180); // same cap as the site
  const state = {
    q: query,
    category: pick(category, HS_CATEGORIES, 'category'),
    material: pick(material, HS_MATERIALS, 'material')
  };
  const max = limit == null || limit === '' ? 10 : Number(limit);
  if (!Number.isInteger(max) || max < 1 || max > MAX_RESULTS) throw new InputError(`limit must be a whole number from 1 to ${MAX_RESULTS}.`);

  const rows = finder.search(index, state, guidance);
  const notes = finder.guidanceFor(state.q, guidance, rows.length);
  const excluded = state.q !== '' && finder.resolveQuery(state.q, guidance).excluded;
  return {
    query: state,
    total: rows.length,
    returned: Math.min(rows.length, max),
    results: rows.slice(0, max).map((row) => formatRow(row, channel)),
    guidance: notes,
    ...(excluded ? { out_of_scope: true } : {}),
    finder_url: siteUrl(FINDER_PATH + (state.q ? '?q=' + encodeURIComponent(state.q) : ''), channel, 'hs-code-finder'),
    dataset: HS_DATASET,
    disclaimer: HS_DISCLAIMER
  };
}
