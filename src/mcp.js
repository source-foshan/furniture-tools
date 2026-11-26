// Remote MCP server (Streamable HTTP, stateless, JSON responses).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/cfworker';
import { z } from 'zod';
import { findHsCode, HS_CATEGORIES, HS_MATERIALS, HS_DATASET, MAX_RESULTS } from './core/hs.js';
import { calculate, InputError, LIMITS } from './core/cbm.js';
import { hsCta, cbmCta } from './core/links.js';
import { VERSION } from './version.js';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const INSTRUCTIONS =
  'Tools from Source Foshan, a furniture sourcing agent in Foshan, China. ' +
  'find_furniture_hs_code suggests international six-digit HS 2022 codes for furniture, seats, mattresses and bedding (headings 9401–9404) ' +
  'from a product description in English or Chinese, with the conditions for choosing each code. Results are candidates for reference, not a ruling: ' +
  'always pass on the disclaimer and tell the user to confirm the national tariff line with a customs broker. ' +
  'calculate_shipping_cbm works out CBM, cubic feet, air volumetric/chargeable weight and sea LCL revenue tons from carton dimensions, ' +
  'or adds up volumes quoted by several suppliers, and suggests LCL, 20GP or 40HQ.';

function hsText(r) {
  const head = r.query.q ? `Furniture HS codes for "${r.query.q}"` : 'Furniture HS codes';
  const lines = [`${head} (${r.dataset.edition}, ${r.total} match${r.total === 1 ? '' : 'es'}${r.returned < r.total ? `, showing ${r.returned}` : ''}):`, ''];
  if (!r.results.length) lines.push(r.out_of_scope ? 'This item is outside the furniture table.' : 'No code in this furniture table matches. Try a simpler product name, a material, or a six-digit code.');
  for (const x of r.results) {
    lines.push(`• ${x.code} — ${x.title}`);
    if (x.choose_when) lines.push(`  Choose when: ${x.choose_when}`);
    if (x.examples.length) lines.push(`  Examples: ${x.examples.slice(0, 3).join('; ')}`);
    if (x.note) lines.push(`  Note: ${x.note}`);
    lines.push(`  Details: ${x.url}`);
  }
  for (const g of r.guidance) lines.push('', `${g.title} ${g.message}`.trim());
  lines.push('', r.disclaimer, '', `Source: Source Foshan furniture HS code finder, ${r.finder_url}`, `${r.cta.text} ${r.cta.url}`);
  return lines.join('\n');
}

function cbmText(r) {
  const lines = [];
  if (r.mode === 'cartons') {
    const t = r.totals;
    lines.push(`Total: ${t.cbm} m³ (${t.cubic_feet} ft³) across ${t.cartons} carton${t.cartons === 1 ? '' : 's'}.`);
    for (const l of r.lines) lines.push(`• Line ${l.line}${l.label ? ` (${l.label})` : ''}: ${l.length_cm}×${l.width_cm}×${l.height_cm} cm × ${l.quantity} = ${l.cbm} m³`);
    lines.push(`Air volumetric weight (÷${r.input.air_divisor}): ${t.air_volumetric_weight_kg} kg`);
    if (t.gross_weight_kg != null) {
      lines.push(`Gross weight: ${t.gross_weight_kg} kg`, `Air chargeable weight: ${t.air_chargeable_weight_kg} kg`, `Sea LCL revenue tons (W/M): ${t.sea_lcl_revenue_tons}`);
    } else lines.push(r.note);
  } else {
    lines.push(`Total: ${r.total_cbm} m³ (${r.total_cubic_feet} ft³) from ${r.suppliers} supplier${r.suppliers === 1 ? '' : 's'}.`);
  }
  lines.push('', `Suggested shipment: ${r.shipment.mode}. ${r.shipment.message}`, '', `${r.cta.text} ${r.cta.url}`);
  return lines.join('\n');
}

function asError(err) {
  if (err instanceof InputError) return { isError: true, content: [{ type: 'text', text: err.message }] };
  throw err;
}

export function createMcpServer() {
  const server = new McpServer(
    { name: 'sourcefoshan-tools', title: 'Source Foshan Furniture Tools', version: VERSION, websiteUrl: 'https://sourcefoshan.com' },
    { instructions: INSTRUCTIONS, jsonSchemaValidator: new CfWorkerJsonSchemaValidator() }
  );

  server.registerTool('find_furniture_hs_code', {
    title: 'Find a furniture HS code',
    description:
      `Suggest international six-digit HS codes (${HS_DATASET.edition}, headings ${HS_DATASET.headings.join(', ')}) for furniture, seats, ` +
      'mattresses and bedding from a product description in English or Chinese, or from a 4–6 digit code. Returns candidate codes ' +
      'with the conditions for choosing each one, classification notes and official sources. Reference only, not a customs ruling.',
    inputSchema: {
      query: z.string().trim().min(1).max(180).describe('Product description, e.g. "wooden dining table", "office chair", "沙发", or an HS code such as "9403.60"'),
      category: z.enum(HS_CATEGORIES).optional().describe('Optional filter by furniture group'),
      material: z.enum(HS_MATERIALS).optional().describe('Optional filter by principal material'),
      limit: z.number().int().min(1).max(MAX_RESULTS).optional().describe('Maximum codes to return (default 10)')
    },
    annotations: { title: 'Find a furniture HS code', ...READ_ONLY }
  }, async ({ query, category, material, limit }) => {
    try {
      const r = { ...findHsCode({ q: query, category, material, limit }, 'mcp'), cta: hsCta('mcp') };
      return { content: [{ type: 'text', text: hsText(r) }], structuredContent: r };
    } catch (err) { return asError(err); }
  });

  const carton = z.object({
    length: z.number().positive().describe('Carton length'),
    width: z.number().positive().describe('Carton width'),
    height: z.number().positive().describe('Carton height'),
    quantity: z.number().int().positive().max(LIMITS.maxQuantity).optional().describe('Number of identical cartons (default 1)'),
    weight: z.number().positive().optional().describe('Gross weight of one carton, in weight_unit'),
    label: z.string().max(120).optional().describe('Optional name for this line, e.g. "3-seat sofa"')
  });

  server.registerTool('calculate_shipping_cbm', {
    title: 'Calculate shipping CBM and container size',
    description:
      'Work out shipping volume and container size for furniture. Either give carton dimensions (cartons) to get CBM, cubic feet, ' +
      'air volumetric and chargeable weight and sea LCL revenue tons, or give the volumes several suppliers quoted (supplier_volumes_m3) ' +
      'to add them up. Both suggest LCL, a 20GP or a 40HQ container using Source Foshan\'s consolidation thresholds ' +
      '(under 15 m³ LCL, under 28 m³ 20GP, up to 68 m³ 40HQ). Send one of the two inputs, not both.',
    inputSchema: {
      cartons: z.array(carton).min(1).max(LIMITS.maxLines).optional().describe('Carton lines with dimensions in unit'),
      unit: z.enum(['cm', 'mm', 'm', 'in']).optional().describe('Dimension unit for cartons (default cm)'),
      weight_unit: z.enum(['kg', 'lb']).optional().describe('Weight unit for cartons (default kg)'),
      air_divisor: z.number().int().min(1000).max(10000).optional().describe('Air volumetric divisor in cm³/kg (default 6000 IATA; couriers often use 5000)'),
      supplier_volumes_m3: z.array(z.number().positive()).min(1).max(LIMITS.maxSupplierVolumes).optional().describe('Volumes in m³ quoted by each supplier, to consolidate into one shipment')
    },
    annotations: { title: 'Calculate shipping CBM and container size', ...READ_ONLY }
  }, async (args) => {
    try {
      const r = { ...calculate(args), cta: cbmCta('mcp') };
      return { content: [{ type: 'text', text: cbmText(r) }], structuredContent: r };
    } catch (err) { return asError(err); }
  });

  return server;
}

export async function handleMcp(request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed. This MCP server is stateless: send JSON-RPC requests with POST.' }, id: null }), {
      status: 405, headers: { 'content-type': 'application/json', allow: 'POST, OPTIONS' }
    });
  }
  const server = createMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(request);
}
