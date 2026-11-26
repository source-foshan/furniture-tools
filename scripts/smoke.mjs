// End-to-end check of a running deployment (local or live), via HTTP and a real MCP client.
// Usage: node scripts/smoke.mjs https://tools.sourcefoshan.com
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { findHsCode } from '../src/core/hs.js';
import { calculate } from '../src/core/cbm.js';

const base = (process.argv[2] || 'http://localhost:8787').replace(/\/$/, '');
let passed = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log(`✔ ${name}`); }
  catch (err) { console.log(`✖ ${name}\n  ${err.message.split('\n').slice(0, 6).join('\n  ')}`); process.exitCode = 1; }
}
async function getJson(path, init) {
  const res = await fetch(base + path, init);
  return { status: res.status, headers: res.headers, body: await res.json() };
}
const strip = ({ cta, ...rest }) => rest;

await check('GET / lists endpoints and MCP URL', async () => {
  const r = await getJson('/');
  assert.equal(r.status, 200);
  assert.equal(r.body.mcp.url, base + '/mcp');
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
});

await check('GET /health', async () => {
  const r = await getJson('/health');
  assert.equal(r.body.status, 'ok');
});

for (const q of ['wooden dining table', '沙发', '9403.60', 'gas lift', 'office chair']) {
  await check(`GET /v1/hs-code?q=${q} matches the website finder`, async () => {
    const r = await getJson('/v1/hs-code?limit=36&q=' + encodeURIComponent(q));
    assert.equal(r.status, 200);
    assert.deepEqual(strip(r.body), findHsCode({ q, limit: 36 }, 'api'));
    assert.ok(r.body.cta.url.startsWith('https://sourcefoshan.com/'));
  });
}

await check('GET /v1/hs-code rejects a bad category with 400', async () => {
  const r = await getJson('/v1/hs-code?q=chair&category=toys');
  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, 'invalid_input');
});

await check('GET /v1/cbm one carton line', async () => {
  const r = await getJson('/v1/cbm?length=120&width=60&height=50&quantity=10&weight=35');
  assert.equal(r.status, 200);
  assert.equal(r.body.totals.cbm, 3.6);
  assert.equal(r.body.totals.gross_weight_kg, 350);
  assert.equal(r.body.shipment.mode, 'LCL');
});

await check('GET /v1/cbm?volumes= matches the site calculator wording', async () => {
  const r = await getJson('/v1/cbm?volumes=12,8.5,3');
  assert.deepEqual(strip(r.body), calculate({ supplier_volumes_m3: [12, 8.5, 3] }));
  assert.equal(r.body.shipment.mode, '20GP');
});

await check('POST /v1/cbm several carton lines', async () => {
  const body = { cartons: [{ length: 120, width: 60, height: 50, quantity: 10, weight: 35 }, { length: 80, width: 80, height: 45, quantity: 4, weight: 22 }] };
  const r = await getJson('/v1/cbm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(r.status, 200);
  assert.deepEqual(strip(r.body), calculate(body));
  assert.equal(r.body.totals.cbm, 4.752);
});

await check('POST /v1/cbm bad JSON → 400, bad method → 405, unknown path → 404', async () => {
  assert.equal((await getJson('/v1/cbm', { method: 'POST', body: '{nope' })).status, 400);
  assert.equal((await getJson('/v1/hs-code', { method: 'POST', body: '{}' })).status, 405);
  assert.equal((await getJson('/nope')).status, 404);
});

await check('OPTIONS preflight allows any origin', async () => {
  const res = await fetch(base + '/mcp', { method: 'OPTIONS', headers: { origin: 'https://example.com', 'access-control-request-method': 'POST' } });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
});

await check('GET /openapi.json is OpenAPI 3.1', async () => {
  const r = await getJson('/openapi.json');
  assert.equal(r.body.openapi, '3.1.0');
  assert.equal(r.body.servers[0].url, base);
});

await check('Widget loader /widget.js is public JS', async () => {
  const res = await fetch(base + '/widget.js');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /javascript/);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  assert.match(await res.text(), /data-sourcefoshan-tool/);
});

for (const tool of ['cbm', 'hs-code']) {
  await check(`Embed page /embed/${tool} can be framed by any site, with a strict CSP`, async () => {
    const res = await fetch(base + '/embed/' + tool);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    const csp = res.headers.get('content-security-policy') || '';
    assert.match(csp, /frame-ancestors \*/);
    assert.match(csp, /script-src 'self'/);
    assert.equal(res.headers.get('x-frame-options'), null);
    assert.equal(res.headers.get('set-cookie'), null);
  });
}

await check('Deployed widget CBM code is identical to the API core', async () => {
  const { readFile } = await import('node:fs/promises');
  const local = await readFile(new URL('../src/core/cbm.js', import.meta.url), 'utf8');
  const remote = await (await fetch(base + '/embed/cbm-core.js')).text();
  assert.equal(remote.slice(remote.indexOf('\n') + 1), local);
});

await check('Browsers get the widgets page at / and /widgets; API clients still get JSON', async () => {
  for (const path of ['/', '/widgets']) {
    const res = await fetch(base + path, { headers: { accept: 'text/html,application/xhtml+xml' } });
    assert.equal(res.status, 200, path);
    assert.match(res.headers.get('content-type'), /text\/html/, path);
    assert.match(await res.text(), /Free furniture shipping tools for your website/, path);
  }
  const api = await fetch(base + '/', { headers: { accept: 'application/json' } });
  assert.match(api.headers.get('content-type'), /application\/json/);
  assert.equal((await api.json()).widgets.script, base + '/widget.js');
});

await check('MCP Registry proof file is served as the registry fetches it', async () => {
  const { MCP_REGISTRY_PROOF } = await import('../src/registry-auth.js');
  const hosts = [base];
  if (base === 'https://tools.sourcefoshan.com') hosts.push('https://sourcefoshan.com'); // the apex route
  for (const host of hosts) {
    const res = await fetch(host + '/.well-known/mcp-registry-auth', { headers: { accept: 'text/plain', 'user-agent': 'mcp-registry/1.0' }, redirect: 'manual' });
    assert.equal(res.status, 200, host);
    assert.match(res.headers.get('content-type'), /text\/plain/, host);
    assert.equal((await res.text()).trim(), MCP_REGISTRY_PROOF, host);
  }
});

await check('llms.txt, robots.txt and sitemap.xml are published', async () => {
  for (const [path, needle] of [['/llms.txt', 'com.sourcefoshan/furniture-tools'], ['/robots.txt', 'Sitemap:'], ['/sitemap.xml', '/widgets']]) {
    const res = await fetch(base + path);
    assert.equal(res.status, 200, path);
    assert.ok((await res.text()).includes(needle), path);
  }
});

const client = new Client({ name: 'sourcefoshan-smoke', version: '1.0.0' });
await check('MCP: connect and list tools', async () => {
  await client.connect(new StreamableHTTPClientTransport(new URL(base + '/mcp')));
  const info = client.getServerVersion();
  assert.equal(info.name, 'sourcefoshan-tools');
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ['calculate_shipping_cbm', 'find_furniture_hs_code']);
  for (const t of tools) assert.equal(t.annotations.readOnlyHint, true);
});

await check('MCP: find_furniture_hs_code matches the website finder', async () => {
  const r = await client.callTool({ name: 'find_furniture_hs_code', arguments: { query: 'wooden dining table' } });
  assert.ok(!r.isError);
  assert.deepEqual(strip(r.structuredContent), findHsCode({ q: 'wooden dining table' }, 'mcp'));
  assert.match(r.content[0].text, /9403\.60 — Other wooden furniture/);
  assert.match(r.content[0].text, /Reference only/);
});

await check('MCP: calculate_shipping_cbm cartons and supplier volumes', async () => {
  const cartons = await client.callTool({ name: 'calculate_shipping_cbm', arguments: { cartons: [{ length: 100, width: 50, height: 40, quantity: 2 }] } });
  assert.equal(cartons.structuredContent.totals.cbm, 0.4);
  const vols = await client.callTool({ name: 'calculate_shipping_cbm', arguments: { supplier_volumes_m3: [30, 25, 10] } });
  assert.equal(vols.structuredContent.shipment.mode, '40HQ');
  assert.match(vols.content[0].text, /Suggested shipment: 40HQ/);
});

await check('MCP: bad input comes back as a tool error, not a crash', async () => {
  const r = await client.callTool({ name: 'calculate_shipping_cbm', arguments: {} });
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /either cartons/);
});
await client.close().catch(() => {});

console.log(`\n${passed} checks passed${process.exitCode ? ', some FAILED' : ''} against ${base}`);
