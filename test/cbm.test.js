import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { calculate, cartonCbm, consolidate, suggestShipment, InputError } from '../src/core/cbm.js';

// Runs the site's own calculator script (synced from sourcefoshan.com) in a fake DOM.
const SITE_SCRIPT = readFileSync(new URL('./fixtures/site-consol-calc.js', import.meta.url), 'utf8');
function siteVerdict(volumes) {
  const inputs = Array.from({ length: 6 }, (_, i) => ({ value: volumes[i] == null ? '' : String(volumes[i]) }));
  const total = { textContent: '' };
  const verdict = { textContent: '' };
  let run;
  const form = {
    querySelector: (sel) => (sel.includes('total') ? total : verdict),
    querySelectorAll: () => inputs,
    addEventListener: (_, fn) => { run = fn; }
  };
  vm.runInNewContext(SITE_SCRIPT, { document: { getElementById: () => form } });
  run();
  return { total: total.textContent, verdict: verdict.textContent };
}

test('supplier volumes: same verdict text as the website calculator', () => {
  const cases = [
    [3], [4.9], [14.9], [15], [10, 5], [27.99], [28], [12, 8.5, 3.2], [20, 20, 20], [68], [68.01],
    [30, 30, 8], [30, 30, 8.1], [40, 40], [22.5, 22.5, 22.5, 22.5, 22.5, 23.5], [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]
  ];
  // plus random sets of 1–6 suppliers up to 136 m³ (where the site's "two containers" wording is exact)
  let seed = 42;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 400; i++) {
    const n = 1 + Math.floor(rnd() * 6);
    const set = Array.from({ length: n }, () => Math.round((0.1 + rnd() * 22) * 10) / 10);
    if (set.reduce((a, b) => a + b, 0) <= 136) cases.push(set);
  }
  for (const volumes of cases) {
    const site = siteVerdict(volumes);
    const ours = consolidate(volumes);
    assert.equal(ours.shipment.message, site.verdict, `volumes ${volumes.join(', ')}`);
    assert.equal(ours.total_cbm.toFixed(1), site.total, `total for ${volumes.join(', ')}`);
  }
});

test('supplier volumes: thresholds and container counts', () => {
  assert.equal(consolidate([14.99]).shipment.mode, 'LCL');
  assert.equal(consolidate([15]).shipment.mode, '20GP');
  assert.equal(consolidate([27.99]).shipment.mode, '20GP');
  assert.equal(consolidate([28]).shipment.mode, '40HQ');
  assert.equal(consolidate([68]).shipment.mode, '40HQ');
  const big = consolidate([68.5]);
  assert.equal(big.shipment.mode, 'MULTIPLE_40HQ');
  assert.equal(big.shipment.containers, 2);
  const huge = consolidate([100, 100, 10]);
  assert.equal(huge.shipment.containers, 4);
  assert.match(huge.shipment.message, /we plan 4 containers/);
  assert.equal(huge.suppliers, 3);
});

test('cartons: CBM, cubic feet and weights', () => {
  const r = cartonCbm([
    { length: 120, width: 60, height: 50, quantity: 10, weight: 35 },
    { length: 80, width: 80, height: 45, quantity: 4, weight: 22 }
  ]);
  // 1.2*0.6*0.5 = 0.36 m³ ×10 = 3.6 ; 0.8*0.8*0.45 = 0.288 ×4 = 1.152
  assert.equal(r.lines[0].cbm_per_carton, 0.36);
  assert.equal(r.lines[0].cbm, 3.6);
  assert.equal(r.lines[1].cbm, 1.152);
  assert.equal(r.totals.cbm, 4.752);
  assert.equal(r.totals.cartons, 14);
  assert.equal(r.totals.cubic_feet, 167.82); // 4.752 × 35.3147 = 167.815
  assert.equal(r.totals.gross_weight_kg, 438);
  // volumetric: 360000/6000=60 ×10=600 ; 288000/6000=48 ×4=192 → 792
  assert.equal(r.totals.air_volumetric_weight_kg, 792);
  assert.equal(r.totals.air_chargeable_weight_kg, 792);
  assert.equal(r.totals.sea_lcl_revenue_tons, 4.752);
  assert.equal(r.shipment.mode, 'LCL');
  assert.match(r.shipment.message, /^about 4\.8 m³ of packed cartons\./);
});

test('cartons: unit conversion (mm, m, in, lb) gives the same CBM', () => {
  const cm = cartonCbm([{ length: 100, width: 50, height: 40, quantity: 2 }]).totals.cbm;
  assert.equal(cm, 0.4);
  assert.equal(cartonCbm([{ length: 1000, width: 500, height: 400, quantity: 2 }], { unit: 'mm' }).totals.cbm, cm);
  assert.equal(cartonCbm([{ length: 1, width: 0.5, height: 0.4, quantity: 2 }], { unit: 'm' }).totals.cbm, cm);
  const inch = cartonCbm([{ length: 40, width: 20, height: 10 }], { unit: 'in' });
  assert.equal(inch.totals.cbm, 0.1311); // 8000 in³ = 0.131097 m³
  const lb = cartonCbm([{ length: 50, width: 50, height: 50, weight: 100 }], { weight_unit: 'lb' });
  assert.equal(lb.totals.gross_weight_kg, 45.36);
});

test('cartons: missing weights leave weight totals null with a note', () => {
  const r = cartonCbm([{ length: 100, width: 100, height: 100, quantity: 3 }, { length: 50, width: 50, height: 50, weight: 10 }]);
  assert.equal(r.totals.gross_weight_kg, null);
  assert.equal(r.totals.air_chargeable_weight_kg, null);
  assert.equal(r.totals.sea_lcl_revenue_tons, null);
  assert.ok(r.note);
  assert.equal(r.totals.cbm, 3.125);
});

test('cartons: heavy cargo uses weight for chargeable weight and revenue tons', () => {
  const r = cartonCbm([{ length: 50, width: 40, height: 30, quantity: 10, weight: 200 }]);
  assert.equal(r.totals.cbm, 0.6);
  assert.equal(r.totals.gross_weight_kg, 2000);
  assert.equal(r.totals.air_chargeable_weight_kg, 2000);
  assert.equal(r.totals.sea_lcl_revenue_tons, 2);
});

test('cartons: custom air divisor (courier 5000)', () => {
  const r = cartonCbm([{ length: 50, width: 50, height: 50, weight: 5 }], { air_divisor: 5000 });
  assert.equal(r.totals.air_volumetric_weight_kg, 25);
});

test('calculate(): picks the mode and rejects both/neither', () => {
  assert.equal(calculate({ cartons: [{ length: 10, width: 10, height: 10 }] }).mode, 'cartons');
  assert.equal(calculate({ supplier_volumes_m3: [5] }).mode, 'supplier_volumes');
  assert.throws(() => calculate({}), InputError);
  assert.throws(() => calculate({ cartons: [], supplier_volumes_m3: [1] }), InputError);
});

test('validation errors are InputError with a clear message', () => {
  const bad = [
    () => cartonCbm([{ length: 0, width: 10, height: 10 }]),
    () => cartonCbm([{ length: -5, width: 10, height: 10 }]),
    () => cartonCbm([{ length: 'abc', width: 10, height: 10 }]),
    () => cartonCbm([{ length: 10, width: 10 }]),
    () => cartonCbm([{ length: 10, width: 10, height: 10, quantity: 1.5 }]),
    () => cartonCbm([{ length: 10, width: 10, height: 10 }], { unit: 'ft' }),
    () => cartonCbm([{ length: 10, width: 10, height: 10 }], { weight_unit: 'g' }),
    () => cartonCbm([{ length: 10, width: 10, height: 10 }], { air_divisor: 6 }),
    () => cartonCbm([{ length: 5000, width: 10, height: 10 }]),
    () => cartonCbm(Array.from({ length: 201 }, () => ({ length: 1, width: 1, height: 1 }))),
    () => cartonCbm([null]),
    () => consolidate([]),
    () => consolidate([5, 0]),
    () => consolidate([Infinity]),
    () => consolidate('12')
  ];
  for (const fn of bad) assert.throws(fn, InputError);
});

test('numeric strings are accepted (query-string input)', () => {
  const r = cartonCbm([{ length: '100', width: '50', height: '40', quantity: '2', weight: '10' }]);
  assert.equal(r.totals.cbm, 0.4);
  assert.equal(r.totals.gross_weight_kg, 20);
});

test('suggestShipment(): supplier prefix only for more than one supplier', () => {
  assert.match(suggestShipment(10, 1).message, /^about 10\.0 m³ quoted/);
  assert.match(suggestShipment(10, 3).message, /^3 suppliers, about 10\.0 m³ quoted/);
});
