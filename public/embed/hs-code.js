import { params, tracked, trackLinks, autoResize, el } from './common.js';

const CAMPAIGN = 'hs-code-finder';
const SHOW = 5;
const $ = (id) => document.getElementById(id);
const form = $('hs-form'), input = $('hs-q'), status = $('hs-status'), list = $('hs-results'),
  guidanceBox = $('hs-guidance'), more = $('hs-more'), disclaimer = $('hs-disclaimer');

trackLinks(document, CAMPAIGN);
autoResize();

const cache = new Map();
let controller = null;
let timer = 0;
let lastQuery = null;

function render(q, data) {
  list.replaceChildren();
  guidanceBox.replaceChildren();
  if (data.dataset) $('hs-edition').textContent = data.dataset.edition;
  if (data.disclaimer) disclaimer.textContent = data.disclaimer;

  if (data.total === 0) status.replaceChildren(data.out_of_scope ? 'Outside this furniture table.' : `No furniture code matches “${q}”. Try a simpler product name or a six-digit code.`);
  else status.replaceChildren(el('strong', { text: `${data.total} candidate code${data.total === 1 ? '' : 's'}` }), ` for “${q}”`, data.total > 1 ? '. Compare the conditions.' : '');

  for (const g of data.guidance || []) {
    guidanceBox.append(el('p', { class: 'sf-note' }, g.title ? el('strong', { text: g.title + ' ' }) : null, g.message));
  }

  for (const r of data.results.slice(0, SHOW)) {
    const copy = el('button', { type: 'button', class: 'sf-btn sf-btn--ghost sf-btn--small hs-copy', 'aria-label': `Copy HS code ${r.code}`, text: 'Copy' });
    copy.addEventListener('click', () => copyCode(copy, r.code));
    list.append(el('li', { class: 'hs-result' },
      el('div', { class: 'hs-result__top' },
        el('a', { class: 'hs-code', href: tracked(r.url, CAMPAIGN), target: '_blank', rel: 'noopener', text: r.code }),
        copy),
      el('h3', { text: r.title }),
      r.choose_when ? el('p', {}, el('strong', { text: 'Choose when: ' }), r.choose_when) : null,
      r.examples?.length ? el('p', {}, el('strong', { text: 'e.g. ' }), r.examples.slice(0, 2).join(' · ')) : null));
  }

  more.hidden = data.total === 0;
  more.href = tracked(data.finder_url, CAMPAIGN);
  more.textContent = data.total > SHOW ? `See all ${data.total} candidates on sourcefoshan.com →` : 'Open in the full HS code finder →';
}

async function search(raw) {
  const q = raw.trim().slice(0, 180);
  if (q === lastQuery) return;
  lastQuery = q;
  if (!q) { status.textContent = ''; list.replaceChildren(); guidanceBox.replaceChildren(); more.hidden = true; return; }
  if (cache.has(q)) { render(q, cache.get(q)); return; }

  controller?.abort();
  controller = new AbortController();
  status.textContent = 'Searching…';
  try {
    const res = await fetch('/v1/hs-code?limit=36&q=' + encodeURIComponent(q), { signal: controller.signal });
    if (res.status === 429) throw new Error('Too many searches from your network. Please wait a minute and try again.');
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || 'Search failed. Please try again.');
    cache.set(q, data);
    if (q === lastQuery) render(q, data);
  } catch (err) {
    if (err.name === 'AbortError') return;
    lastQuery = null;
    list.replaceChildren();
    guidanceBox.replaceChildren();
    more.hidden = true;
    status.replaceChildren(el('span', { class: 'hs-error', text: err.message || 'Search failed. Please try again.' }));
  }
}

async function copyCode(button, code) {
  let ok = false;
  try { await navigator.clipboard.writeText(code); ok = true; } catch { /* clipboard blocked by the host page */ }
  if (!ok) {
    const field = el('textarea', { readonly: true, class: 'sr-only' });
    field.value = code;
    document.body.append(field);
    field.select();
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    field.remove();
  }
  button.textContent = ok ? 'Copied' : 'Select & copy';
  button.classList.toggle('is-copied', ok);
  setTimeout(() => { button.textContent = 'Copy'; button.classList.remove('is-copied'); }, 1800);
}

input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => search(input.value), 350); });
form.addEventListener('submit', (e) => { e.preventDefault(); clearTimeout(timer); search(input.value); });
$('hs-chips').addEventListener('click', (e) => {
  const chip = e.target.closest('[data-q]');
  if (!chip) return;
  input.value = chip.dataset.q;
  clearTimeout(timer);
  search(input.value);
});

const initial = params.get('q');
if (initial) { input.value = initial.slice(0, 180); search(input.value); }
