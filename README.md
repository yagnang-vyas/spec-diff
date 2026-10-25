# SpecDiff

SpecDiff compares two OpenAPI 3.x documents and classifies every contract change as **breaking**,
**warning**, **safe** or **info**, so API changes can be gated in pull requests instead of being
discovered by mobile and partner clients after a deploy.

A pull request that removes a response field, makes a query parameter required or narrows an enum
is hard to spot in a large YAML diff. SpecDiff reads both documents, resolves every `$ref`
(including recursive schemas and relative files), and tells you which changes can break existing
clients, with the rule that fired and where in each document it happened.

- Direction-aware: request schemas break when they get stricter, response schemas break when they
  get looser or lose data.
- OpenAPI 3.0.x and 3.1.x, compared against each other (`nullable: true` and `type: [T, "null"]`
  are the same thing).
- Text, JSON and Markdown reports with deterministic ordering.
- Exit codes built for CI, configurable with `--fail-on`.
- Honest about its limits: constructs it does not analyze are reported, not ignored.

<!-- Live Playground: once the site in web/ is deployed, add its URL here as "**[Live Playground](URL)**". -->

## Install

SpecDiff is not published to npm. Install it from a clone (Node.js 22.19 or newer):

```sh
git clone https://github.com/yagnang-vyas/spec-diff.git
cd spec-diff
npm ci
npm run build
node dist/cli.js --help      # or: npm link   to get a `specdiff` command
```

## Usage

```
specdiff <base> <head> [--format text|json|markdown] [--fail-on breaking|warning|never]
                       [--include-safe] [--ignore RULE_ID,...] [--version] [--help]
```

| Option                | Meaning                                                                                             |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| `--format`            | `text` (default), `json` or `markdown`                                                              |
| `--fail-on`           | Exit `1` when a change at or above this severity exists: `breaking` (default), `warning` or `never` |
| `--include-safe`      | List safe changes too (hidden by default; they are still counted in the summary)                    |
| `--ignore`            | Drop rules by ID, comma separated or repeated. Unknown IDs are an error                             |
| `--version`, `--help` | Print the version or usage                                                                          |

`info` notes (renamed path parameters, unsupported constructs) are shown by default and never affect
the exit code.

### Exit codes

| Code  | Meaning                                                                                                                                                     |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`   | Nothing at or above the `--fail-on` threshold                                                                                                               |
| `1`   | Changes at or above the threshold                                                                                                                           |
| `2`   | Usage or input error: bad flags, unreadable file, invalid or unsupported spec (the message is prefixed with the file name), or an unexpected internal error |
| `130` | Interrupted (SIGINT)                                                                                                                                        |
| `141` | Output pipe closed early (for example when piping into `head -1`); exits quietly                                                                            |

## Sample output

The repository ships an original, synthetic 33-operation bookstore API in
[`examples/bookstore`](examples/bookstore). `v2.yaml` mixes 60+ changes of every severity into
`v1.yaml`. Everything below is the real output of the commands shown, and the test suite fails if
it drifts.

### Text

```sh
specdiff examples/bookstore/v1.yaml examples/bookstore/v2.yaml
```

```text
specdiff 0.1.0
base: examples/bookstore/v1.yaml (Lantern Books API 1.0.0, OpenAPI 3.0.3)
head: examples/bookstore/v2.yaml (Lantern Books API 2.0.0, OpenAPI 3.0.3)

POST /authors
  WARNING   REQ_CONSTRAINT_TIGHTENED     request body application/json: pattern of "slug" changed from "^[a-z0-9-]+$" to "^[a-z0-9_-]+$"

PUT /authors/{authorId}
  WARNING   REQ_CONSTRAINT_TIGHTENED     request body application/json: pattern of "slug" changed from "^[a-z0-9-]+$" to "^[a-z0-9_-]+$"

DELETE /authors/{authorId}
  BREAKING  OP_REMOVED                   operation DELETE /authors/{authorId} removed

GET /authors/{authorId}/books
  WARNING   RESP_ENUM_WIDENED            200 application/json: enum of "value[].format" widened: added "audiobook"
  BREAKING  RESP_PROPERTY_REMOVED        200 application/json: property "value[].subtitle" removed

GET /books
  WARNING   RESP_ENUM_WIDENED            200 application/json: enum of "items[].format" widened: added "audiobook"
  BREAKING  RESP_PROPERTY_REMOVED        200 application/json: property "items[].subtitle" removed

POST /books
  BREAKING  REQ_PROPERTY_REQUIRED_ADDED  request body application/json: property "isbn13" added as required
  WARNING   RESP_ENUM_WIDENED            201 application/json: enum of "format" widened: added "audiobook"
  BREAKING  RESP_PROPERTY_REMOVED        201 application/json: property "subtitle" removed

GET /books/{bookId}
  WARNING   PARAM_REMOVED                query parameter "include" removed
  WARNING   RESP_ENUM_WIDENED            200 application/json: enum of "format" widened: added "audiobook"
  BREAKING  RESP_PROPERTY_REMOVED        200 application/json: property "subtitle" removed

PUT /books/{bookId}
  BREAKING  REQ_PROPERTY_REQUIRED_ADDED  request body application/json: property "isbn13" added as required
  WARNING   RESP_ENUM_WIDENED            200 application/json: enum of "format" widened: added "audiobook"
  BREAKING  RESP_PROPERTY_REMOVED        200 application/json: property "subtitle" removed

PATCH /books/{bookId}
  BREAKING  REQ_BODY_BECAME_REQUIRED     request body is now required
  WARNING   RESP_ENUM_WIDENED            200 application/json: enum of "format" widened: added "audiobook"
  BREAKING  RESP_PROPERTY_REMOVED        200 application/json: property "subtitle" removed

POST /books/{bookId}/reviews
  BREAKING  REQ_CONSTRAINT_TIGHTENED     request body application/json: maximum of "rating" tightened from 10 to 5

GET /customers
  BREAKING  RESP_BECAME_NULLABLE         200 application/json: "value[].email" can now be null
  INFO      UNSUPPORTED_CONSTRUCT        200 application/json: "oneOf" differs between versions at "value[].preferences.contact" (not analyzed, review manually)

POST /customers
  INFO      UNSUPPORTED_CONSTRUCT        request body application/json: "oneOf" differs between versions at "preferences.contact" (not analyzed, review manually)
  BREAKING  RESP_BECAME_NULLABLE         201 application/json: "email" can now be null
  INFO      UNSUPPORTED_CONSTRUCT        201 application/json: "oneOf" differs between versions at "preferences.contact" (not analyzed, review manually)

GET /customers/{customerId}
  BREAKING  RESP_BECAME_NULLABLE         200 application/json: "email" can now be null
  INFO      UNSUPPORTED_CONSTRUCT        200 application/json: "oneOf" differs between versions at "preferences.contact" (not analyzed, review manually)
  WARNING   RESP_STATUS_REMOVED          response status 404 removed

PUT /customers/{customerId}
  INFO      UNSUPPORTED_CONSTRUCT        request body application/json: "oneOf" differs between versions at "preferences.contact" (not analyzed, review manually)
  BREAKING  RESP_BECAME_NULLABLE         200 application/json: "email" can now be null
  INFO      UNSUPPORTED_CONSTRUCT        200 application/json: "oneOf" differs between versions at "preferences.contact" (not analyzed, review manually)

GET /orders
  BREAKING  PARAM_BECAME_REQUIRED        query parameter "status" is now required
  WARNING   RESP_ENUM_WIDENED            200 application/json: enum of "value[].status" widened: added "refunded"
  BREAKING  TYPE_CHANGED                 200 application/json: type of "value[].total" changed from integer to number

POST /orders
  BREAKING  REQ_ENUM_NARROWED            request body application/json: enum of "paymentMethod" narrowed: removed "cheque"
  WARNING   RESP_ENUM_WIDENED            201 application/json: enum of "status" widened: added "refunded"
  BREAKING  TYPE_CHANGED                 201 application/json: type of "total" changed from integer to number

/orders/{id}/items
  INFO      PATH_PARAM_RENAMED           path template renamed from /orders/{orderId}/items to /orders/{id}/items (same shape, treated as the same path)

GET /orders/{orderId}
  WARNING   RESP_ENUM_WIDENED            200 application/json: enum of "status" widened: added "refunded"
  BREAKING  TYPE_CHANGED                 200 application/json: type of "total" changed from integer to number

POST /orders/{orderId}/cancel
  WARNING   OP_DEPRECATED                operation is now deprecated
  WARNING   RESP_ENUM_WIDENED            200 application/json: enum of "status" widened: added "refunded"
  BREAKING  TYPE_CHANGED                 200 application/json: type of "total" changed from integer to number

/publishers/{publisherId}
  BREAKING  PATH_REMOVED                 path /publishers/{publisherId} removed

GET /search
  WARNING   RESP_ENUM_WIDENED            200 application/json: enum of "value[].format" widened: added "audiobook"
  BREAKING  RESP_PROPERTY_REMOVED        200 application/json: property "value[].subtitle" removed
  BREAKING  SECURITY_ADDED               security requirement became stricter (was none, now bearerAuth)

Summary: 24 breaking, 16 warning, 7 info (15 safe hidden, use --include-safe to list them)
```

### Markdown

`--format markdown` produces a summary table and one section per operation, suitable for a pull
request comment or a job summary (first lines shown):

```sh
specdiff examples/bookstore/v1.yaml examples/bookstore/v2.yaml --format markdown
```

```markdown
## SpecDiff report

- Base: `examples/bookstore/v1.yaml (Lantern Books API 1.0.0, OpenAPI 3.0.3)`
- Head: `examples/bookstore/v2.yaml (Lantern Books API 2.0.0, OpenAPI 3.0.3)`

| Severity | Changes |
| --- | ---: |
| Breaking | 24 |
| Warning | 16 |
| Safe | 15 (hidden) |
| Info | 7 |

### `POST /authors`

| Severity | Rule | Change |
| --- | --- | --- |
| Warning | `REQ_CONSTRAINT_TIGHTENED` | request body application/json: pattern of "slug" changed from "^\[a-z0-9-\]+$" to "^\[a-z0-9\_-\]+$" |

### `PUT /authors/{authorId}`

| Severity | Rule | Change |
| --- | --- | --- |
```

### JSON

`--format json` prints a stable document (`schemaVersion: 1`); keys and change order are
deterministic. Locations are JSON-pointer-like paths into each document (`null` when the element
does not exist on that side). The start of the output with `--include-safe`:

```sh
specdiff examples/bookstore/v1.yaml examples/bookstore/v2.yaml --format json --include-safe
```

```json
{
  "schemaVersion": 1,
  "tool": {
    "name": "specdiff",
    "version": "0.1.0"
  },
  "base": {
    "file": "examples/bookstore/v1.yaml",
    "openapi": "3.0.3",
    "title": "Lantern Books API",
    "version": "1.0.0"
  },
  "head": {
    "file": "examples/bookstore/v2.yaml",
    "openapi": "3.0.3",
    "title": "Lantern Books API",
    "version": "2.0.0"
  },
  "changes": [
    {
      "id": "PARAM_ADDED_OPTIONAL",
      "severity": "safe",
      "operation": "GET /authors",
      "location": {
        "base": null,
        "head": "paths./authors.get.parameters.query.sort"
      },
      "message": "optional query parameter \"sort\" added"
    },
    ...
```

## How compatibility is decided

A schema describes data flowing in one direction, and what counts as a compatible change is
different in each direction.

**Why requests and responses differ.** The server _consumes_ requests, so a request change breaks
clients when the server accepts **less** than before: a new required field, a removed enum value,
a smaller `maxLength`. The server _produces_ responses, so a response change breaks clients when
the server may now send **more** than clients were promised or **less** than they relied on: a
removed field, a field that may now be `null`, a larger `maxLength`, a new enum value that an
exhaustive `switch` has never seen. The same edit is therefore safe in one direction and breaking
in the other: widening `integer` to `number` is fine in a request and breaking in a response.

SpecDiff compares dereferenced schemas, treats a pair of schemas that is already being compared
higher up the stack as equal (so recursive schemas terminate), and never reports a stricter
response or a looser request as breaking.

### Rule reference

Severity is the default; a few rules override it as noted. See [SPEC.md](SPEC.md) for the full
rationale and the numbered design decisions.

| Rule                                   | Severity | Meaning                                                             |
| -------------------------------------- | -------- | ------------------------------------------------------------------- |
| `PATH_REMOVED`                         | breaking | path removed                                                        |
| `PATH_ADDED`                           | safe     | path added                                                          |
| `PATH_PARAM_RENAMED`                   | info     | path template renamed with the same shape                           |
| `OP_REMOVED`                           | breaking | HTTP method removed from a path that still exists                   |
| `OP_ADDED`                             | safe     | HTTP method added                                                   |
| `OP_DEPRECATED`                        | warning  | operation newly deprecated                                          |
| `PARAM_ADDED_REQUIRED`                 | breaking | new required parameter                                              |
| `PARAM_ADDED_OPTIONAL`                 | safe     | new optional parameter                                              |
| `PARAM_BECAME_REQUIRED`                | breaking | parameter became required                                           |
| `PARAM_BECAME_OPTIONAL`                | safe     | parameter became optional                                           |
| `PARAM_REMOVED`                        | warning  | parameter removed                                                   |
| `PARAM_LOCATION_CHANGED`               | breaking | parameter moved to a different location                             |
| `PARAM_SERIALIZATION_CHANGED`          | breaking | effective style/explode changed                                     |
| `REQ_BODY_BECAME_REQUIRED`             | breaking | request body became required, or a required body was added          |
| `REQ_BODY_BECAME_OPTIONAL`             | safe     | request body became optional                                        |
| `REQ_BODY_ADDED`                       | safe     | optional request body added                                         |
| `REQ_BODY_REMOVED`                     | warning  | request body removed                                                |
| `REQ_MEDIA_TYPE_REMOVED`               | breaking | request content type removed                                        |
| `REQ_MEDIA_TYPE_ADDED`                 | safe     | request content type added                                          |
| `REQ_PROPERTY_REQUIRED_ADDED`          | breaking | property became required, or a required property was added          |
| `REQ_PROPERTY_REQUIRED_REMOVED`        | safe     | property is no longer required                                      |
| `REQ_PROPERTY_ADDED`                   | safe     | optional property added                                             |
| `REQ_PROPERTY_REMOVED`                 | warning  | property removed                                                    |
| `REQ_ENUM_NARROWED`                    | breaking | enum value removed, or enum added to a free value                   |
| `REQ_ENUM_WIDENED`                     | safe     | enum value added, or enum removed                                   |
| `REQ_CONSTRAINT_TIGHTENED`             | breaking | constraint tightened, or an opaque constraint added or changed      |
| `REQ_CONSTRAINT_LOOSENED`              | safe     | constraint loosened or removed                                      |
| `REQ_ADDITIONAL_PROPERTIES_DISALLOWED` | breaking | additionalProperties changed to false                               |
| `REQ_ADDITIONAL_PROPERTIES_ALLOWED`    | safe     | additionalProperties changed from false                             |
| `REQ_BECAME_NON_NULLABLE`              | breaking | value that could be null no longer can                              |
| `REQ_BECAME_NULLABLE`                  | safe     | value that could not be null now can                                |
| `RESP_STATUS_REMOVED`                  | breaking | documented status code removed (warning unless 2xx)                 |
| `RESP_STATUS_ADDED`                    | safe     | status code added                                                   |
| `RESP_MEDIA_TYPE_REMOVED`              | breaking | response content type removed                                       |
| `RESP_MEDIA_TYPE_ADDED`                | safe     | response content type added                                         |
| `RESP_PROPERTY_REMOVED`                | breaking | property removed                                                    |
| `RESP_PROPERTY_ADDED`                  | safe     | property added                                                      |
| `RESP_PROPERTY_BECAME_OPTIONAL`        | breaking | property removed from required                                      |
| `RESP_PROPERTY_BECAME_REQUIRED`        | safe     | property added to required                                          |
| `RESP_BECAME_NULLABLE`                 | breaking | value can now be null                                               |
| `RESP_BECAME_NON_NULLABLE`             | safe     | value can no longer be null                                         |
| `RESP_ENUM_WIDENED`                    | warning  | enum value added, or enum removed                                   |
| `RESP_ENUM_NARROWED`                   | safe     | enum value removed, or enum added to a free value                   |
| `RESP_CONSTRAINT_LOOSENED`             | breaking | constraint loosened or removed (warning for opaque changes)         |
| `RESP_CONSTRAINT_TIGHTENED`            | safe     | constraint tightened or added                                       |
| `TYPE_CHANGED`                         | breaking | type changed (safe when the change is compatible in this direction) |
| `UNSUPPORTED_CONSTRUCT`                | info     | an unanalyzed keyword differs between versions                      |
| `SECURITY_ADDED`                       | breaking | security requirement became stricter                                |
| `SECURITY_RELAXED`                     | safe     | security requirement became less strict                             |

## CI recipe (GitHub Actions)

Compare the pull request's `openapi.yaml` with the one on the base branch. The job needs full
history (`fetch-depth: 0`) so `origin/<base>` exists, writes the Markdown report to the job
summary, and fails when SpecDiff exits non-zero.

```yaml
name: API compatibility
on:
  pull_request:
    paths: [openapi.yaml]
permissions:
  contents: read
concurrency:
  group: specdiff-${{ github.ref }}
  cancel-in-progress: true
jobs:
  specdiff:
    runs-on: ubuntu-latest
    env:
      SPECDIFF: ${{ github.workspace }}/.specdiff/dist/cli.js
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Install SpecDiff
        run: |
          git clone --depth 1 https://github.com/yagnang-vyas/spec-diff .specdiff
          (cd .specdiff && npm ci && npm run build)
      - name: Extract the base branch spec
        run: git show origin/${{ github.base_ref }}:openapi.yaml > base.yaml
      - name: Compare
        run: |
          node "$SPECDIFF" base.yaml openapi.yaml --format markdown --include-safe >> "$GITHUB_STEP_SUMMARY" || true
          node "$SPECDIFF" base.yaml openapi.yaml
```

The job only needs read access. This recipe is exercised by the test suite against two commits of the bookstore example (see
`test/integration/ci-recipe.test.ts`). The `git clone` line tracks the default branch; pin it to a
commit once you have chosen one.

## Unsupported constructs

SpecDiff does not analyze these keywords. When one differs between the two documents it reports
`UNSUPPORTED_CONSTRUCT` (severity `info`) at the schema where it appears, so a human can review it:

`oneOf`, `anyOf`, `not`, `if` / `then` / `else`, `patternProperties`, `dependentSchemas`,
`dependentRequired`, `prefixItems`, `contains`, `propertyNames`, `unevaluatedProperties`,
`unevaluatedItems`.

## Limitations

- OpenAPI 3.0.x and 3.1.x only. Swagger 2.0, AsyncAPI and OpenAPI 3.2 are rejected (exit `2`).
- Regular expressions and `format` values are compared as text; a changed `pattern` is a warning
  because containment is not analyzed.
- `allOf` is flattened shallowly: properties are merged and `required` is unioned, but conflicting
  scalar keywords resolve to the last member.
- Not compared: response headers, links, callbacks, webhooks, servers, examples, `discriminator`,
  security scheme definitions (only which schemes and scopes an operation requires).
- A response `additionalProperties` change between "forbidden" and "allowed" is not reported.
- Two paths in one document with the same template shape (`/a/{x}` and `/a/{y}`) are rejected.
- External `$ref`s must be local files; `http(s)` references are deliberately not fetched.
- Locations join keys with dots, so a path that itself contains a dot is ambiguous. They are a
  navigation aid, not a grammar.

## Prior art

- [oasdiff](https://github.com/oasdiff/oasdiff) (Go) is comprehensive and the right choice when you
  need broad coverage of OpenAPI.
- [openapi-diff](https://github.com/OpenAPITools/openapi-diff) (Java).

SpecDiff aims to be small, written in TypeScript, explicit about its direction-aware rules, and
honest about what it does not analyze.

## Roadmap

- Publish to npm and provide a ready-made GitHub Action.
- `oneOf` / `anyOf` analysis for the common discriminated-union cases.
- Response header and security scheme comparison.
- Configuration file for per-rule severity overrides.
- SARIF output for code-scanning integrations.

## Development

```sh
npm ci
npm run check     # typecheck, lint, build, publint, tests with coverage (>= 90%)
UPDATE_GOLDEN=1 npm test   # regenerate the bookstore golden files, then review the diff
```

See [SPEC.md](SPEC.md) for the specification and [AGENTS.md](AGENTS.md) for contributor notes.

The [`web/`](web) directory holds the project site and an in-browser Playground. It is a separate
static app with its own dependencies and is not part of the published package; see
[`web/README.md`](web/README.md).

## License

MIT, see [LICENSE](LICENSE).
