import { params, trackLinks, autoResize, el } from './common.js';
import { cartonCbm, consolidate, SHIPMENT_THRESHOLDS as T, InputError } from './cbm-core.js';

const CAMPAIGN = 'cbm-calculator';
const MAX_LINES = 20;
const MAX_SUPPLIERS = 20;
const LB_PER_KG = 1 / 0.45359237;
const $ = (id) => document.getElementById(id);
const fmt = (n, max = 3) => new Intl.NumberFormat('en', { maximumFractionDigits: max }).format(n);

trackLinks(document, CAMPAIGN);
autoResize();

let mode = 'cartons';
let system = params.get('unit') === 'in' ? 'imperial' : 'metric';
const units = () => (system === 'metric' ? { len: 'cm', wt: 'kg' } : { len: 'in', wt: 'lb' });

/* ---------- carton lines ---------- */
const linesBox = $('cbm-lines');
const FIELDS = [
  { key: 'length', label: () => `Length (${units().len})`, ph: () => (system === 'metric' ? '120' : '48') },
  { key: 'width', label: () => `Width (${units().len})`, ph: () => (system === 'metric' ? '60' : '24') },
  { key: 'height', label: () => `Height (${units().len})`, ph: () => (system === 'metric' ? '50' : '20') },
  { key: 'quantity', label: () => 'Cartons', ph: () => '1', integer: true },
  { key: 'weight', label: () => `Weight/ctn (${units().wt})`, ph: () => 'optional' }
];
let uid = 0;

function addLine(focus = true) {
  if (linesBox.children.length >= MAX_LINES) return;
  const n = ++uid;
  const row = el('div', { class: 'cbm-line' });
  for (const f of FIELDS) {
    const id = `l${n}-${f.key}`;
    row.append(el('div', {},
      el('label', { class: 'sf-label', for: id, 'data-label': f.key, text: f.label() }),
      el('input', { class: 'sf-input', id, type: 'number', inputmode: f.integer ? 'numeric' : 'decimal', min: f.integer ? '1' : '0', step: f.integer ? '1' : 'any', placeholder: f.ph(), 'data-key': f.key })));
  }
  row.append(el('button', { type: 'button', class: 'cbm-remove', 'aria-label': 'Remove this carton line', text: '×' }));
  linesBox.append(row);
  syncLineControls();
  if (focus) row.querySelector('input').focus();
}

function syncLineControls() {
  const rows = [...linesBox.children];
  rows.forEach((row, i) => {
    row.querySelector('.cbm-remove').disabled = rows.length === 1;
    row.querySelector('.cbm-remove').setAttribute('aria-label', `Remove carton line ${i + 1}`);
  });
  $('add-line').disabled = rows.length >= MAX_LINES;
}

linesBox.addEventListener('click', (e) => {
  const btn = e.target.closest('.cbm-remove');
  if (!btn) return;
  btn.closest('.cbm-line').remove();
  syncLineControls();
  update();
});
$('add-line').addEventListener('click', () => { addLine(); update(); });

/* ---------- supplier volumes ---------- */
const suppliersBox = $('cbm-suppliers');
function addSupplier() {
  const i = suppliersBox.children.length;
  if (i >= MAX_SUPPLIERS) return;
  const id = `s${i}`;
  suppliersBox.append(el('div', {},
    el('label', { class: 'sf-label', for: id, text: `Supplier ${String.fromCharCode(65 + i)} (m³)` }),
    el('input', { class: 'sf-input', id, type: 'number', inputmode: 'decimal', min: '0', step: 'any', placeholder: 'm³' })));
  $('add-supplier').disabled = suppliersBox.children.length >= MAX_SUPPLIERS;
}
$('add-supplier').addEventListener('click', () => { addSupplier(); suppliersBox.lastElementChild.querySelector('input').focus(); });

/* ---------- tabs and units ---------- */
function setMode(next) {
  mode = next;
  for (const name of ['cartons', 'suppliers']) {
    const tab = $(`tab-${name}`);
    const on = name === mode;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
    $(`panel-${name}`).hidden = !on;
  }
  update();
}
$('tab-cartons').addEventListener('click', () => setMode('cartons'));
$('tab-suppliers').addEventListener('click', () => setMode('suppliers'));
document.querySelector('[role=tablist]').addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  const next = mode === 'cartons' ? 'suppliers' : 'cartons';
  setMode(next);
  $(`tab-${next}`).focus();
});

function setSystem(next) {
  if (next === system) return;
  const lenFactor = next === 'imperial' ? 1 / 2.54 : 2.54;
  const wtFactor = next === 'imperial' ? LB_PER_KG : 1 / LB_PER_KG;
  system = next;
  // Convert what is already typed so the cartons stay the same size.
  linesBox.querySelectorAll('input').forEach((input) => {
    const key = input.dataset.key;
    if (input.value === '' || key === 'quantity') return;
    const v = Number(input.value);
    if (Number.isFinite(v)) input.value = String(Math.round(v * (key === 'weight' ? wtFactor : lenFactor) * 100) / 100);
  });
  linesBox.querySelectorAll('[data-label]').forEach((label) => { label.textContent = FIELDS.find((f) => f.key === label.dataset.label).label(); });
  linesBox.querySelectorAll('input').forEach((input) => { input.placeholder = FIELDS.find((f) => f.key === input.dataset.key).ph(); });
  document.querySelectorAll('[data-system]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.system === system)));
  update();
}
document.querySelectorAll('[data-system]').forEach((b) => b.addEventListener('click', () => setSystem(b.dataset.system)));
document.querySelectorAll('[data-system]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.system === system)));

/* ---------- reading inputs ---------- */
function readNumber(input, { integer = false } = {}) {
  const raw = input.value.trim();
  if (raw === '') { input.removeAttribute('aria-invalid'); return { empty: true }; }
  const n = Number(raw);
  const ok = Number.isFinite(n) && n > 0 && (!integer || Number.isInteger(n)) && !input.validity.badInput;
  input.setAttribute('aria-invalid', String(!ok));
  return ok ? { value: n } : { invalid: true };
}

function readCartons() {
  const cartons = [];
  const lineNumbers = []; // UI line number for each counted carton line
  const problems = [];
  [...linesBox.children].forEach((row, i) => {
    const get = (k) => row.querySelector(`[data-key=${k}]`);
    const vals = Object.fromEntries(FIELDS.map((f) => [f.key, readNumber(get(f.key), { integer: f.integer })]));
    if (Object.values(vals).every((v) => v.empty)) return;
    const dims = ['length', 'width', 'height'];
    if (Object.values(vals).some((v) => v.invalid)) problems.push(`Line ${i + 1}: use numbers above 0${vals.quantity.invalid ? ' (whole cartons)' : ''}.`);
    else if (dims.some((k) => vals[k].empty)) problems.push(`Line ${i + 1}: add length, width and height.`);
    else {
      cartons.push({ length: vals.length.value, width: vals.width.value, height: vals.height.value, quantity: vals.quantity.value ?? 1, weight: vals.weight.value });
      lineNumbers.push(i + 1);
    }
  });
  return { cartons, lineNumbers, problems };
}

function readSuppliers() {
  const volumes = [];
  const problems = [];
  [...suppliersBox.querySelectorAll('input')].forEach((input, i) => {
    const v = readNumber(input);
    if (v.invalid) problems.push(`Supplier ${String.fromCharCode(65 + i)}: use a volume above 0.`);
    else if (!v.empty) volumes.push(v.value);
  });
  return { volumes, problems };
}

/* ---------- rendering ---------- */
const MODE_LABEL = { LCL: 'Shared container (LCL)', '20GP': 'One 20-foot container', '40HQ': 'One 40-foot high-cube' };

function stat(label, value, small) {
  return el('div', { class: 'cbm-stat' }, el('dt', { text: label }), el('dd', {}, value, small ? el('small', { text: ' ' + small }) : null));
}
const kg = (v) => (system === 'imperial' ? [`${fmt(v * LB_PER_KG, 1)} lb`, `${fmt(v, 1)} kg`] : [`${fmt(v, 1)} kg`, null]);

function renderShipment(total, shipment) {
  const multi = shipment.mode === 'MULTIPLE_40HQ';
  $('out-mode').textContent = multi ? `${shipment.containers} × 40HQ` : shipment.mode;
  $('out-mode-label').textContent = multi ? `${shipment.containers} × 40-foot high-cube` : MODE_LABEL[shipment.mode];
  $('out-msg').textContent = shipment.message.charAt(0).toUpperCase() + shipment.message.slice(1);

  const max = multi ? shipment.containers * T.hq40UpTo : T.hq40UpTo;
  $('out-fill').style.width = `${Math.min(total / max, 1) * 100}%`;
  const bar = $('out-bar');
  bar.querySelectorAll('.cbm-bar__tick').forEach((t) => t.remove());
  const marks = multi
    ? Array.from({ length: shipment.containers - 1 }, (_, i) => [(i + 1) * T.hq40UpTo, ''])
    : [[T.lclBelow, 'LCL'], [T.gp20Below, '20GP']];
  const scale = $('out-scale');
  scale.replaceChildren(el('span', { text: '0' }));
  for (const [at, label] of marks) {
    const tick = el('div', { class: 'cbm-bar__tick' });
    tick.style.left = `${(at / max) * 100}%`;
    bar.append(tick);
    const s = el('span', { text: label ? `${at} ${label}` : String(at) });
    s.style.left = `${(at / max) * 100}%`;
    scale.append(s);
  }
  const end = el('span', { text: multi ? `${max} m³` : `${T.hq40UpTo} m³ 40HQ` });
  end.style.left = '100%';
  scale.append(end);
}

function show(result, total) {
  $('cbm-empty').hidden = true;
  $('cbm-output').hidden = false;
  $('out-cbm').replaceChildren(fmt(total), el('small', { text: ' m³' }));
  const stats = $('out-stats');
  stats.replaceChildren();

  if (result.mode === 'cartons') {
    const t = result.totals;
    $('out-meta').textContent = `${fmt(t.cubic_feet, 1)} ft³ · ${fmt(t.cartons, 0)} carton${t.cartons === 1 ? '' : 's'}`;
    if (t.gross_weight_kg != null) {
      stats.append(stat('Gross weight', ...kg(t.gross_weight_kg)), stat('Air chargeable weight', ...kg(t.air_chargeable_weight_kg)), stat('Sea LCL (W/M)', fmt(t.sea_lcl_revenue_tons), 'revenue tons'));
    } else {
      stats.append(stat('Air volumetric weight', ...kg(t.air_volumetric_weight_kg)), stat('Gross weight', '—', 'add weights'), stat('Sea LCL (W/M)', '—', 'add weights'));
    }
  } else {
    $('out-meta').textContent = `${fmt(result.total_cubic_feet, 1)} ft³ · ${result.suppliers} supplier${result.suppliers === 1 ? '' : 's'}`;
  }
  stats.hidden = result.mode !== 'cartons';
  renderShipment(total, result.shipment);
}

function clear(message) {
  $('cbm-empty').textContent = message;
  $('cbm-empty').hidden = false;
  $('cbm-output').hidden = true;
}

function update() {
  const hint = $('cbm-hint');
  let problems = [];
  let lineNumbers = [];
  try {
    if (mode === 'cartons') {
      const read = readCartons();
      problems = read.problems;
      lineNumbers = read.lineNumbers;
      if (!read.cartons.length) clear('Enter carton length, width and height to see the CBM.');
      else {
        const r = cartonCbm(read.cartons, { unit: units().len, weight_unit: units().wt });
        show(r, r.totals.cbm);
      }
    } else {
      const read = readSuppliers();
      problems = read.problems;
      if (!read.volumes.length) clear('Enter the volume each supplier quoted to see the total.');
      else {
        const r = consolidate(read.volumes);
        show(r, r.total_cbm);
      }
    }
  } catch (err) {
    if (!(err instanceof InputError)) throw err;
    problems.push(err.message
      .replace(/cartons\[(\d+)\]\.(\w+)/, (_, i, field) => `Line ${lineNumbers[Number(i)] ?? Number(i) + 1}: ${field}`)
      .replace(/supplier_volumes_m3\[(\d+)\]/, (_, i) => `Supplier ${String.fromCharCode(65 + Number(i))}`));
    clear('Check the highlighted values.');
  }
  hint.textContent = problems.join(' ');
  hint.classList.toggle('is-error', problems.length > 0);
}

document.addEventListener('input', update);

addLine(false);
for (let i = 0; i < 3; i++) addSupplier();
update();
