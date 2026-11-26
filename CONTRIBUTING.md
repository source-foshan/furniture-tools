# Contributing

Thanks for helping. Two kinds of contribution are most useful.

## HS code data corrections

The HS data is synced from the [finder on sourcefoshan.com](https://sourcefoshan.com/resources/furniture-hs-code-finder/), so please **open an issue** rather than editing `src/vendor/` directly. Include:

- the product (what it is, main material, how it is built),
- the code you got and the code you believe is right,
- a source: the WCO HS explanatory notes, a national customs ruling, or a broker's classification.

Fixes go into the website first, then into this repository with `npm run sync`.

## Code changes

1. `npm ci`, then make your change.
2. `npm test` must pass. Add a test for new behaviour.
3. Keep the embed pages free of inline scripts and styles (the CSP blocks them; `test/assets.test.js` checks).
4. Open a pull request describing what changed and how you checked it.

By contributing you agree that your code is released under the MIT license and data contributions under CC BY 4.0.
