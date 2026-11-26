// Source Foshan Furniture Tools: REST API + remote MCP server on Cloudflare Workers.
import { findHsCode, hsFilters, HS_DATASET } from './core/hs.js';
import { calculate, InputError } from './core/cbm.js';
import { hsCta, cbmCta, SITE } from './core/links.js';
import { handleMcp } from './mcp.js';
import { openapi } from './openapi.js';
import { VERSION } from './version.js';
import { MCP_REGISTRY_AUTH_PATH, MCP_REGISTRY_PROOF } from './registry-auth.js';

const MAX_BODY_BYTES = 100_000;
const RATE_LIMIT_TEXT = '60 requests per minute per IP';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID',
  'access-control-expose-headers': 'Mcp-Session-Id, MCP-Protocol-Version, Retry-After'
};

function withCors(response) {
  const res = new Response(response.body, response);
  for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
  return res;
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff', ...CORS, ...headers }
  });
}

const fail = (status, code, message, headers) => json({ error: { code, message } }, status, headers);
const CACHE = { 'cache-control': 'public, max-age=3600' };

function methodNotAllowed(allowed) {
  return fail(405, 'method_not_allowed', `Use ${allowed.join(' or ')}.`, { allow: [...allowed, 'OPTIONS'].join(', ') });
}

async function readJson(request) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_BODY_BYTES) return { tooLarge: true };
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return { tooLarge: true };
  try { return { body: JSON.parse(text) }; } catch { throw new InputError('The request body must be valid JSON.'); }
}

function cbmFromQuery(params) {
  const volumes = params.get('volumes');
  if (volumes != null) {
    return { supplier_volumes_m3: volumes.split(',').map((v) => v.trim()).filter(Boolean).map(Number) };
  }
  const n = (k) => (params.get(k) == null || params.get(k) === '' ? undefined : params.get(k));
  if (!n('length') && !n('width') && !n('height')) {
    throw new InputError('Give length, width and height (one carton line), or volumes=12,8.5,3 (supplier volumes in m³). POST JSON for several carton lines.');
  }
  return {
    cartons: [{ length: n('length'), width: n('width'), height: n('height'), quantity: n('quantity'), weight: n('weight') }],
    unit: n('unit'),
    weight_unit: n('weight_unit'),
    air_divisor: n('air_divisor') === undefined ? undefined : Number(n('air_divisor'))
  };
}

function home(origin) {
  return {
    name: 'Source Foshan Furniture Tools',
    version: VERSION,
    description: 'Free furniture HS code finder and shipping CBM calculator from Source Foshan, a furniture sourcing agent in Foshan, China.',
    endpoints: {
      hs_code: `${origin}/v1/hs-code?q=wooden+dining+table`,
      hs_code_filters: `${origin}/v1/hs-code/filters`,
      cbm_one_carton: `${origin}/v1/cbm?length=120&width=60&height=50&quantity=10&weight=35`,
      cbm_supplier_volumes: `${origin}/v1/cbm?volumes=12,8.5,3`,
      cbm_post: `POST ${origin}/v1/cbm`,
      mcp: `${origin}/mcp`,
      openapi: `${origin}/openapi.json`
    },
    mcp: {
      url: `${origin}/mcp`,
      transport: 'streamable-http',
      tools: ['find_furniture_hs_code', 'calculate_shipping_cbm']
    },
    widgets: {
      page: `${origin}/widgets`,
      script: `${origin}/widget.js`,
      tools: ['cbm', 'hs-code']
    },
    rate_limit: RATE_LIMIT_TEXT,
    hs_dataset: HS_DATASET,
    website: SITE
  };
}

const wantsHtml = (request) => /\btext\/html\b/.test(request.headers.get('accept') || '');

async function route(request, url, env) {
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method;
  const origin = url.origin;

  switch (path) {
    case '/': {
      if (method !== 'GET' && method !== 'HEAD') return methodNotAllowed(['GET']);
      // Browsers get the widgets page; API clients get the JSON index.
      if (wantsHtml(request) && env.ASSETS) {
        const page = await env.ASSETS.fetch(new Request(new URL('/widgets', url), { method, headers: request.headers }));
        const res = new Response(page.body, page);
        res.headers.set('vary', 'Accept');
        return res;
      }
      return json(home(origin), 200, { ...CACHE, vary: 'Accept' });
    }
    case '/health':
      return method === 'GET' || method === 'HEAD' ? json({ status: 'ok', version: VERSION, hs_dataset: HS_DATASET }, 200, { 'cache-control': 'no-store' }) : methodNotAllowed(['GET']);
    case '/openapi.json':
      return method === 'GET' || method === 'HEAD' ? json(openapi(origin), 200, CACHE) : methodNotAllowed(['GET']);
    case '/v1/hs-code': {
      if (method !== 'GET' && method !== 'HEAD') return methodNotAllowed(['GET']);
      const p = url.searchParams;
      const result = findHsCode({ q: p.get('q') ?? '', category: p.get('category') ?? '', material: p.get('material') ?? '', limit: p.get('limit') ?? undefined }, 'api');
      return json({ ...result, cta: hsCta('api') }, 200, CACHE);
    }
    case '/v1/hs-code/filters':
      return method === 'GET' || method === 'HEAD' ? json(hsFilters(), 200, CACHE) : methodNotAllowed(['GET']);
    case '/v1/cbm': {
      if (method === 'GET' || method === 'HEAD') return json({ ...calculate(cbmFromQuery(url.searchParams)), cta: cbmCta('api') }, 200, CACHE);
      if (method !== 'POST') return methodNotAllowed(['GET', 'POST']);
      const { body, tooLarge } = await readJson(request);
      if (tooLarge) return fail(413, 'payload_too_large', `The request body must be under ${MAX_BODY_BYTES} bytes.`);
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('The request body must be a JSON object with cartons or supplier_volumes_m3.');
      return json({ ...calculate(body), cta: cbmCta('api') }, 200, { 'cache-control': 'no-store' });
    }
    case '/mcp':
      return withCors(await handleMcp(request));
    default:
      return fail(404, 'not_found', `No endpoint at ${path}. See ${origin}/ for the list.`);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // MCP Registry domain proof. Also reached on sourcefoshan.com through a route on
    // exactly this path, so it must answer before anything else and never be rate limited.
    if (url.pathname === MCP_REGISTRY_AUTH_PATH) {
      return new Response(MCP_REGISTRY_PROOF + '\n', {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff' }
      });
    }
    // The apex route covers only the path above; anything else that reaches us on
    // sourcefoshan.com is a misconfiguration, so do not serve the tools there.
    if (url.hostname === 'sourcefoshan.com' || url.hostname === 'www.sourcefoshan.com') {
      return fail(404, 'not_found', 'Not found.');
    }

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...CORS, 'access-control-max-age': '86400' } });

    if (env.RATE_LIMITER && url.pathname !== '/health') {
      const key = request.headers.get('cf-connecting-ip') || 'unknown';
      const { success } = await env.RATE_LIMITER.limit({ key });
      if (!success) return fail(429, 'rate_limited', `Too many requests. The limit is ${RATE_LIMIT_TEXT}.`, { 'retry-after': '60' });
    }

    try {
      return await route(request, url, env);
    } catch (err) {
      if (err instanceof InputError) return fail(400, 'invalid_input', err.message);
      console.error(JSON.stringify({ message: 'unhandled error', path: url.pathname, error: String(err?.stack || err) }));
      return fail(500, 'internal_error', 'Something went wrong. Please try again later.');
    }
  }
};
