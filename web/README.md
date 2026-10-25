# SpecDiff web

A static site for SpecDiff: a landing page and an in-browser Playground. It lives in `web/` with its
own `package.json`, lockfile, tests and build. The root CLI package does not depend on it, and the
`specdiff` npm package does not include it (`files` in the root `package.json` is an allow-list).

## Commands

Run these inside `web/` (Node.js 22.19 or newer). Only `npm ci` in `web/` is needed; the root install
is not required.

```sh
npm ci
npm run dev        # dev server with hot reload
npm run build      # type check, then production build into dist/
npm run preview    # serve dist/ locally
npm test           # vitest: engine parity, DOM behavior, landing page
npm run typecheck
```

## Does the Playground run the real engine?

Yes. `src/engine.ts` imports `normalizeSpec`, `diffSpecs` and the text, Markdown and JSON report
renderers directly from `../src` and runs them unchanged. No core file is modified or copied.

Only loading differs. The CLI's `loadSpec` reads files through `SwaggerParser.validate(path)`. The
browser adapter parses editor text with `yaml` (JSON is accepted too), then calls the same
`SwaggerParser.validate()` on the in-memory object and repeats the OpenAPI 3.0/3.1 version check from
`src/load.ts`. `test/engine.test.ts` runs every fixture pair in `test/fixtures` through both loaders
and requires identical changes, and checks the bookstore golden JSON and text reports.

Browser limits, all shown in the UI:

- OpenAPI 3.0.x and 3.1.x only, like the CLI.
- `$ref`s must point inside the document. Relative file references (which the CLI resolves) are
  rejected with an error, and the `_cross-file` fixture is therefore not part of the parity test.
  `http(s)` references are never fetched, in the CLI or here.
- 1 MB per document. Parsing and comparison run on the main thread.
- No syntax highlighting: the editors are plain, accessible text areas.

The browser build pulls in a `buffer` polyfill because `@apidevtools/swagger-parser` checks
`Buffer.isBuffer` while parsing. Vite prints "externalized for browser compatibility" warnings for
the parser's HTTP resolver; it is disabled at runtime (`http: false`) and never called.

## Privacy

Specifications are processed in the page. The site makes no network requests with their contents,
sets no cookies, has no analytics, writes nothing to storage and puts nothing in the URL.

## Deploying to Netlify

`netlify.toml` at the repository root sets the base directory to `web`, the build command to
`npm ci && npm run build` and the publish directory to `dist`. To deploy, create a Netlify site from
the GitHub repository and accept those settings; no environment variables or backend are needed. The
site is plain multi-page static HTML (`/` and `/playground/`), so there are no client-side routes to
rewrite. Asset URLs are relative, so it also works from a sub-path.

Once a deployment exists, add its URL to the README at the marked comment near the top.

## Layout

```
web/
  index.html            landing page
  playground/index.html Playground page
  src/engine.ts         browser adapter around the core engine
  src/locate.ts         resolves change locations to values for before/after panes
  src/playground.ts     Playground UI
  src/examples.ts       preloaded examples (a small one, the bookstore, a no-change pair)
  src/samples/          the small Orders API example
  src/styles.css        shared styles
  test/                 vitest suites
```
