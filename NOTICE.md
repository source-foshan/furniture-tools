# Notices

| What | License |
|---|---|
| Source code (everything not listed below) | MIT, see [LICENSE](LICENSE) |
| HS code data: `src/vendor/hs-data.json`, `src/vendor/hs-guidance.json` | CC BY 4.0, see [LICENSE-DATA.md](LICENSE-DATA.md) |
| Fonts: `public/fonts/*.woff2` (Hanken Grotesk, Plus Jakarta Sans) | SIL Open Font License 1.1, see [public/fonts/OFL.txt](public/fonts/OFL.txt) |
| "Source Foshan" name and logo, including `public/icon-512.png` | Not licensed, see below |

## Trademarks

"Source Foshan", the Source Foshan logo and the sourcefoshan.com domain are trademarks and brand
assets of Xianpei (Foshan) Home Furnishing Co., Ltd. The licenses above do not grant any right to use
them. If you deploy your own copy, replace the name, logo, links and domain-specific settings
(`wrangler.jsonc` routes, `src/core/links.js`, `src/registry-auth.js`, `registry/server.json`) with
your own, and do not present your deployment as operated by or affiliated with Source Foshan.

## Vendored website code

`src/vendor/hs-finder.cjs` and `test/fixtures/site-consol-calc.js` are copies of the search and
calculator code that runs on sourcefoshan.com, synced by `npm run sync`. They are released under the
MIT license together with the rest of the code.
