import { HS_CATEGORIES, HS_MATERIALS, HS_DATASET, MAX_RESULTS } from './core/hs.js';
import { LIMITS } from './core/cbm.js';
import { VERSION } from './version.js';

export function openapi(origin) {
  const error = { $ref: '#/components/responses/Error' };
  return {
    openapi: '3.1.0',
    info: {
      title: 'Source Foshan Furniture Tools API',
      version: VERSION,
      description:
        `Free, read-only tools from Source Foshan (https://sourcefoshan.com): a furniture HS code finder (${HS_DATASET.edition}, ` +
        `headings ${HS_DATASET.headings.join('–')}) and a shipping CBM / container calculator. No key needed; 60 requests per minute per IP. ` +
        `An MCP server with the same tools is at ${origin}/mcp.`
    },
    servers: [{ url: origin }],
    paths: {
      '/v1/hs-code': {
        get: {
          operationId: 'findFurnitureHsCode',
          summary: 'Find furniture HS codes from a product description or code',
          parameters: [
            { name: 'q', in: 'query', description: 'Product description in English or Chinese (e.g. "wooden dining table", "沙发") or a 4–6 digit HS code. Empty returns all codes.', schema: { type: 'string', maxLength: 180 } },
            { name: 'category', in: 'query', schema: { type: 'string', enum: HS_CATEGORIES } },
            { name: 'material', in: 'query', schema: { type: 'string', enum: HS_MATERIALS } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: MAX_RESULTS, default: 10 } }
          ],
          responses: { 200: { description: 'Candidate codes, guidance, dataset version and disclaimer', content: { 'application/json': { schema: { type: 'object' } } } }, 400: error, 429: error }
        }
      },
      '/v1/hs-code/filters': {
        get: { operationId: 'listHsCodeFilters', summary: 'Allowed category and material filter values', responses: { 200: { description: 'Filter values with labels' } } }
      },
      '/v1/cbm': {
        get: {
          operationId: 'calculateCbmSimple',
          summary: 'CBM for one carton line, or a total of supplier volumes',
          description: 'Give length, width and height (plus optional quantity, weight, unit, weight_unit, air_divisor) for one carton line, or volumes=12,8.5,3 for supplier volumes in m³.',
          parameters: [
            ...['length', 'width', 'height'].map((name) => ({ name, in: 'query', schema: { type: 'number', exclusiveMinimum: 0 } })),
            { name: 'quantity', in: 'query', schema: { type: 'integer', minimum: 1, maximum: LIMITS.maxQuantity, default: 1 } },
            { name: 'weight', in: 'query', description: 'Gross weight per carton', schema: { type: 'number', exclusiveMinimum: 0 } },
            { name: 'unit', in: 'query', schema: { type: 'string', enum: ['cm', 'mm', 'm', 'in'], default: 'cm' } },
            { name: 'weight_unit', in: 'query', schema: { type: 'string', enum: ['kg', 'lb'], default: 'kg' } },
            { name: 'air_divisor', in: 'query', schema: { type: 'integer', minimum: 1000, maximum: 10000, default: 6000 } },
            { name: 'volumes', in: 'query', description: 'Comma-separated supplier volumes in m³', schema: { type: 'string' } }
          ],
          responses: { 200: { description: 'CBM result and suggested shipment' }, 400: error, 429: error }
        },
        post: {
          operationId: 'calculateCbm',
          summary: 'CBM and container size for many carton lines, or a total of supplier volumes',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CbmRequest' } } }
          },
          responses: { 200: { description: 'CBM result and suggested shipment' }, 400: error, 413: error, 429: error }
        }
      }
    },
    components: {
      schemas: {
        CbmRequest: {
          type: 'object',
          description: 'Send either cartons or supplier_volumes_m3, not both.',
          properties: {
            cartons: {
              type: 'array', minItems: 1, maxItems: LIMITS.maxLines,
              items: {
                type: 'object', required: ['length', 'width', 'height'],
                properties: {
                  length: { type: 'number', exclusiveMinimum: 0 }, width: { type: 'number', exclusiveMinimum: 0 }, height: { type: 'number', exclusiveMinimum: 0 },
                  quantity: { type: 'integer', minimum: 1, maximum: LIMITS.maxQuantity, default: 1 },
                  weight: { type: 'number', exclusiveMinimum: 0, description: 'Gross weight per carton' },
                  label: { type: 'string', maxLength: 120 }
                }
              }
            },
            unit: { type: 'string', enum: ['cm', 'mm', 'm', 'in'], default: 'cm' },
            weight_unit: { type: 'string', enum: ['kg', 'lb'], default: 'kg' },
            air_divisor: { type: 'integer', minimum: 1000, maximum: 10000, default: 6000 },
            supplier_volumes_m3: { type: 'array', minItems: 1, maxItems: LIMITS.maxSupplierVolumes, items: { type: 'number', exclusiveMinimum: 0 } }
          }
        },
        Error: {
          type: 'object',
          properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } } }
        }
      },
      responses: { Error: { description: 'Error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } } }
    }
  };
}
