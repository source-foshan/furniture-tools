# Source Foshan Furniture Tools

Free, read-only tools for furniture importers, as a **remote MCP server**, a **JSON API** and **embeddable website widgets**:

- **Furniture HS code finder**: candidate six-digit HS 2022 codes for seats, furniture, medical/salon furniture, mattresses and bedding (headings 9401–9404) from a product description in English or Chinese, with the conditions for choosing each code.
- **CBM and container calculator**: CBM, cubic feet, air volumetric and chargeable weight and sea LCL revenue tons from carton sizes, or the total of volumes quoted by several suppliers, with an LCL / 20GP / 40HQ suggestion.

Built and run by [Source Foshan](https://sourcefoshan.com), a furniture sourcing agent in Foshan, China. It runs on Cloudflare Workers.

[![CI](https://github.com/source-foshan/furniture-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/source-foshan/furniture-tools/actions/workflows/ci.yml)

## Use the hosted version

No key, no sign-up. 60 requests per minute per IP.

| | |
|---|---|
| MCP server (Streamable HTTP) | `https://tools.sourcefoshan.com/mcp` |
| MCP Registry | [`com.sourcefoshan/furniture-tools`](https://registry.modelcontextprotocol.io/v0.1/servers/com.sourcefoshan%2Ffurniture-tools/versions/latest) |
| Widgets and embed codes | https://tools.sourcefoshan.com/widgets |
| OpenAPI 3.1 | https://tools.sourcefoshan.com/openapi.json |
| Summary for AI crawlers | https://tools.sourcefoshan.com/llms.txt |

### MCP tools

- `find_furniture_hs_code(query, category?, material?, limit?)`: e.g. `"wooden dining table"`, `"沙发"`, `"9403.60"`.
- `calculate_shipping_cbm(cartons? | supplier_volumes_m3?, unit?, weight_unit?, air_divisor?)`.

Both are read-only and return readable text plus `structuredContent`. Add the URL above as a custom connector in any AI assistant that supports remote MCP servers.

### JSON API

| Endpoint | What it does |
|---|---|
| `GET /v1/hs-code?q=wooden+dining+table` | Candidate codes, guidance, dataset version and disclaimer. Optional `category`, `material`, `limit` (1–36). |
| `GET /v1/hs-code/filters` | Allowed `category` and `material` values |
| `GET /v1/cbm?length=120&width=60&height=50&quantity=10&weight=35` | One carton line. Optional `unit` (cm/mm/m/in), `weight_unit` (kg/lb), `air_divisor` (default 6000) |
| `GET /v1/cbm?volumes=12,8.5,3` | Total of supplier-quoted volumes in m³ |
| `POST /v1/cbm` | `{ "cartons": [{ "length": 120, "width": 60, "height": 50, "quantity": 10, "weight": 35 }] }` or `{ "supplier_volumes_m3": [12, 8.5, 3] }` |

### Widgets

```html
<div data-sourcefoshan-tool="cbm">
  <a href="https://sourcefoshan.com/furniture-shipping-and-consolidation-from-china/">Furniture CBM calculator</a> by Source Foshan
</div>
<script src="https://tools.sourcefoshan.com/widget.js" async></script>
```

Tools: `cbm` (option `data-unit="in"`) and `hs-code` (option `data-query="sofa"`). Each widget loads in its own iframe, resizes itself and does not touch the host page's styles.

## How it works

```
src/
  index.js          router: REST API, MCP endpoint, CORS, rate limit
  mcp.js            MCP server (official TypeScript SDK, stateless Streamable HTTP)
  openapi.js        OpenAPI 3.1 document
  core/hs.js        HS search wrapper around the website's own finder code
  core/cbm.js       CBM, weights and container suggestion (shared with the widget)
  core/links.js     links back to sourcefoshan.com with UTM tags
  vendor/           finder code + HS data synced from sourcefoshan.com
public/             widget loader, embed pages, landing page, fonts (Workers static assets)
scripts/            sync from the site, drift check, smoke test, asset build
test/               unit tests (node:test) and a mock host page for widget testing
registry/           MCP Registry listing (server.json)
```

**One source of truth.** The HS search is the exact code that runs the [finder on sourcefoshan.com](https://sourcefoshan.com/resources/furniture-hs-code-finder/), and the container thresholds are those of the site's consolidation calculator. `npm run sync` copies them from the live site; the tests check that the API answers what the website answers (including 400+ random cases run through the site's own calculator script), and `npm run check:site` reports when the live site has changed.

## Run it yourself

Requires Node.js 22.12 or later.

```bash
npm ci
```

```bash
npm test
```

```bash
npx wrangler dev --local-upstream 127.0.0.1:8787
```

```bash
node scripts/smoke.mjs http://127.0.0.1:8787
```

To deploy your own copy, set `CLOUDFLARE_ACCOUNT_ID`, replace the routes in `wrangler.jsonc` and the Source Foshan links, name and logo (see [NOTICE.md](NOTICE.md)), then run `npx wrangler deploy`.

## Disclaimer

HS codes are international six-digit candidates for reference, not a customs ruling. National tariff lines (8–10 digits) and duty rates differ by country; confirm classifications with a licensed customs broker. CBM and container suggestions are planning estimates; container fit depends on the real packing list.

## License

- Code: [MIT](LICENSE)
- HS code data (`src/vendor/hs-data.json`, `src/vendor/hs-guidance.json`): [CC BY 4.0](LICENSE-DATA.md). Credit: "Furniture HS code data by Source Foshan".
- Fonts: [SIL OFL 1.1](public/fonts/OFL.txt)
- The Source Foshan name and logo are not licensed; see [NOTICE.md](NOTICE.md).

Corrections to the HS data and bug reports are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).
