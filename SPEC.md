# SpecDiff specification

SpecDiff compares two OpenAPI 3.0.x / 3.1.x documents and classifies every contract change as
**breaking**, **warning**, **safe** or **info**. This document is the contract the implementation and
its tests are written against. The implementation brief this project was built from lives outside the
repository; everything that matters is restated here.

## Severities

| Severity   | Meaning                                                               | Shown by default |
| ---------- | --------------------------------------------------------------------- | ---------------- |
| `breaking` | Existing, correctly written clients can fail.                         | yes              |
| `warning`  | Clients may fail, or the tool cannot prove the change is compatible.  | yes              |
| `safe`     | Backwards compatible.                                                 | `--include-safe` |
| `info`     | Not a compatibility verdict: a note for the reviewer (renames, gaps). | yes              |

`info` never affects the exit code.

## Direction-aware comparison

A schema describes data flowing in one direction, and compatibility runs the opposite way in each:

- **Request** schemas (parameters, request bodies) are _consumed by the server_. A change is breaking
  when the server accepts **less** than before: a new required field, a removed enum value, a smaller
  `maxLength`, a narrower type.
- **Response** schemas are _produced by the server_ and consumed by clients. A change is breaking when
  the server may now send **more** than clients were told to expect, or **less** than they relied on:
  a removed field, a field that became optional or nullable, a larger `maxLength`, a wider type.

Each rule below therefore exists in a request flavour and a response flavour with opposite verdicts
where the direction matters.

## Rule table

Severity is the default; "(→ x)" marks a documented context-dependent override.

### Paths and operations

| ID                   | Change                                                          | Severity |
| -------------------- | --------------------------------------------------------------- | -------- |
| `PATH_REMOVED`       | path removed                                                    | breaking |
| `PATH_ADDED`         | path added                                                      | safe     |
| `PATH_PARAM_RENAMED` | path template renamed with the same shape (`{id}` → `{userId}`) | info     |
| `OP_REMOVED`         | HTTP method removed from a path that still exists               | breaking |
| `OP_ADDED`           | HTTP method added                                               | safe     |
| `OP_DEPRECATED`      | operation newly `deprecated: true`                              | warning  |

### Parameters

| ID                            | Change                                                  | Severity |
| ----------------------------- | ------------------------------------------------------- | -------- |
| `PARAM_ADDED_REQUIRED`        | new required parameter                                  | breaking |
| `PARAM_ADDED_OPTIONAL`        | new optional parameter                                  | safe     |
| `PARAM_BECAME_REQUIRED`       | optional → required                                     | breaking |
| `PARAM_BECAME_OPTIONAL`       | required → optional                                     | safe     |
| `PARAM_REMOVED`               | parameter removed (servers may now reject or ignore it) | warning  |
| `PARAM_LOCATION_CHANGED`      | same name, different `in`                               | breaking |
| `PARAM_SERIALIZATION_CHANGED` | effective `style` / `explode` changed                   | breaking |

### Request bodies

| ID                                     | Change                                                                                                                                                                                 | Severity                                                                                            |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `REQ_BODY_BECAME_REQUIRED`             | body optional → required, or a required body added                                                                                                                                     | breaking                                                                                            |
| `REQ_BODY_BECAME_OPTIONAL`             | body required → optional                                                                                                                                                               | safe                                                                                                |
| `REQ_BODY_ADDED`                       | optional body added                                                                                                                                                                    | safe                                                                                                |
| `REQ_BODY_REMOVED`                     | body removed                                                                                                                                                                           | warning                                                                                             |
| `REQ_MEDIA_TYPE_REMOVED`               | request content type removed                                                                                                                                                           | breaking                                                                                            |
| `REQ_MEDIA_TYPE_ADDED`                 | request content type added                                                                                                                                                             | safe                                                                                                |
| `REQ_PROPERTY_REQUIRED_ADDED`          | property newly in `required` (new or existing property)                                                                                                                                | breaking                                                                                            |
| `REQ_PROPERTY_REQUIRED_REMOVED`        | property removed from `required`                                                                                                                                                       | safe                                                                                                |
| `REQ_PROPERTY_ADDED`                   | optional property added                                                                                                                                                                | safe                                                                                                |
| `REQ_PROPERTY_REMOVED`                 | property removed                                                                                                                                                                       | warning                                                                                             |
| `REQ_ENUM_NARROWED`                    | enum value removed, or enum added to a free value                                                                                                                                      | breaking                                                                                            |
| `REQ_ENUM_WIDENED`                     | enum value added, or enum removed                                                                                                                                                      | safe                                                                                                |
| `REQ_CONSTRAINT_TIGHTENED`             | `maxLength`/`maximum`/`maxItems`/`maxProperties` decreased, `minLength`/`minimum`/`minItems`/`minProperties` increased, `uniqueItems` turned on, `pattern`/`format`/`multipleOf` added | breaking (`pattern`/`format`/`multipleOf` _changed_ → warning, because containment is not analyzed) |
| `REQ_CONSTRAINT_LOOSENED`              | the reverse of the above                                                                                                                                                               | safe                                                                                                |
| `REQ_ADDITIONAL_PROPERTIES_DISALLOWED` | `additionalProperties` true/absent → false                                                                                                                                             | breaking                                                                                            |
| `REQ_ADDITIONAL_PROPERTIES_ALLOWED`    | `additionalProperties` false → true/schema                                                                                                                                             | safe                                                                                                |
| `REQ_BECAME_NON_NULLABLE`              | value that could be null no longer can                                                                                                                                                 | breaking                                                                                            |
| `REQ_BECAME_NULLABLE`                  | value that could not be null now can                                                                                                                                                   | safe                                                                                                |

### Responses

| ID                              | Change                                                                     | Severity                                                       |
| ------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `RESP_STATUS_REMOVED`           | documented status code removed                                             | breaking for `2xx` (→ warning otherwise)                       |
| `RESP_STATUS_ADDED`             | status code added                                                          | safe                                                           |
| `RESP_MEDIA_TYPE_REMOVED`       | response content type removed                                              | breaking                                                       |
| `RESP_MEDIA_TYPE_ADDED`         | response content type added                                                | safe                                                           |
| `RESP_PROPERTY_REMOVED`         | property removed                                                           | breaking                                                       |
| `RESP_PROPERTY_ADDED`           | property added                                                             | safe                                                           |
| `RESP_PROPERTY_BECAME_OPTIONAL` | property removed from `required`                                           | breaking                                                       |
| `RESP_PROPERTY_BECAME_REQUIRED` | property added to `required`                                               | safe                                                           |
| `RESP_BECAME_NULLABLE`          | value can now be null                                                      | breaking                                                       |
| `RESP_BECAME_NON_NULLABLE`      | value can no longer be null                                                | safe                                                           |
| `RESP_ENUM_WIDENED`             | enum value added, or enum removed (clients with exhaustive switches break) | warning                                                        |
| `RESP_ENUM_NARROWED`            | enum value removed, or enum added to a free value                          | safe                                                           |
| `RESP_CONSTRAINT_LOOSENED`      | `max*` increased, `min*` decreased, a constraint removed                   | breaking (`pattern`/`format`/`multipleOf` _changed_ → warning) |
| `RESP_CONSTRAINT_TIGHTENED`     | the reverse of the above                                                   | safe                                                           |

### Shared

| ID                      | Change                                                                                                                                                                                                    | Severity        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `TYPE_CHANGED`          | type changed. Request: breaking unless the new type accepts every old value (`integer` → `number` is safe). Response: breaking unless the new type is a subset of the old (`number` → `integer` is safe). | breaking / safe |
| `SECURITY_ADDED`        | the operation's effective security became stricter: a scheme or scope is now required, or a previously accepted alternative was dropped                                                                   | breaking        |
| `SECURITY_RELAXED`      | the operation's effective security became less strict                                                                                                                                                     | safe            |
| `UNSUPPORTED_CONSTRUCT` | a schema uses a keyword SpecDiff does not analyze and it differs between versions                                                                                                                         | info            |

Rules that go beyond the original design brief are explained in Decision 2.

## Decisions

Ambiguities are resolved conservatively and recorded here.

1. **`info` severity.** The brief calls the unsupported-construct output a "note". It is exposed as
   severity `info` so reports have one closed vocabulary: `breaking | warning | safe | info`.
2. **Extension rules.** The brief's table lists the core rules. A diff that only recognised those
   would silently ignore changes such as a response `maxLength` increase, a removed request body or a
   response status code being added. Extension rules (those absent from the brief's table: everything
   covering an _opposite-direction_ or _additive_ change, `PARAM_SERIALIZATION_CHANGED`,
   `PATH_PARAM_RENAMED`, `REQ_BODY_*` additions/removals, `*_CONSTRAINT_LOOSENED/TIGHTENED` for
   responses, nullability reversals, `SECURITY_RELAXED`) fill those gaps. Each has its own fixture.
3. **Path matching.** Paths match by template _shape_: every `{name}` becomes `{}`. Two paths in one
   document with the same shape make the document unusable for comparison, so SpecDiff exits `2`
   rather than guess.
4. **Path parameters** are keyed by their position in the template, not their name, so renaming
   `{id}` to `{userId}` yields only `PATH_PARAM_RENAMED`. Other parameters are keyed by `(in, name)`;
   header names compare case-insensitively.
5. **Operation names in reports** use the _head_ path template (the base template when the path was
   removed). Locations are recorded per document, each with its own template, so they are exact.
6. **Locations** are dot-joined keys, for example
   `paths./users/{id}.get.responses.200.content.application/json.schema.properties.email`. Parameters
   are addressed by `parameters.<in>.<name>`. A location is `null` for a document in which the
   element does not exist. Keys containing `.` make the pointer ambiguous; it is a navigation aid,
   not a parseable grammar.
7. **Path-level parameters** are merged into every operation; operation-level parameters win.
8. **Nullability.** OpenAPI 3.0 `nullable: true` and 3.1 `type: [T, "null"]` (and `type: "null"`)
   normalize to the same internal form. An untyped schema accepts everything including null, so
   nullability is compared only when both sides are typed.
9. **Untyped schemas** are inferred from their keywords (`properties` → object, `items` → array);
   otherwise they accept any type. In a request, tightening "any" to a concrete type is
   `TYPE_CHANGED` breaking; in a response, loosening a concrete type to "any" is `TYPE_CHANGED`
   breaking.
10. **`readOnly` / `writeOnly`.** Request comparison ignores `readOnly` properties and response
    comparison ignores `writeOnly` ones, because those properties never travel in that direction.
11. **`allOf`** is flattened before comparison: properties are merged (a property defined by several
    members is compared as an `allOf` of them), `required` is unioned, and for other keywords the
    last member that sets one wins. This is shallow, see _Limitations_.
12. **Recursion.** Schemas are compared dereferenced. A pair of schema objects (base, head) that is
    already being compared further up the stack counts as equal for that branch. A depth guard of
    100 levels reports `UNSUPPORTED_CONSTRUCT` instead of looping when composition defeats object
    identity.
    A pair that compared clean is remembered, so a shared sub-schema is compared once per
    media type rather than once per path to it (diamond-shaped schemas would otherwise take
    exponential time). A shared sub-schema that did change is reported at every location that
    uses it.
13. **Enums** compare as sets of canonical JSON values; `const` is treated as a one-value enum.
14. **Numeric bounds** are normalized so that the 3.0 boolean form (`exclusiveMinimum: true`) and the
    3.1 numeric form compare equal; an equal bound that became exclusive counts as tightened.
15. **Opaque constraints** (`pattern`, `format`, `multipleOf`): added = tightened, removed =
    loosened, changed = a `warning`, because regex/format containment is not analyzed.
16. **Security** is compared on the _effective_ requirement set (operation `security` overrides the
    document-level one; `[]` or `{}` means anonymous access is allowed). A base alternative
    survives if some head alternative requires a subset of its schemes and scopes. Scheme
    definitions themselves (flows, `in`, `type`) are not compared, and renaming a scheme counts as
    a change.
17. **Media types** are compared case-insensitively with parameters (`; charset=utf-8`) removed.
    Wildcards are literal keys.
18. **Status codes**: `2XX`-style ranges are upper-cased. `RESP_STATUS_REMOVED` is breaking for any
    code (or range) starting with `2`, a warning otherwise, including `default`.
19. **External references.** Relative file `$ref`s resolve; `http(s)` references are not fetched,
    which keeps runs offline and deterministic.
20. **Exit codes** follow the brief. `--ignore` with an unknown rule ID is a usage error (`2`).
    `info` and ignored rules never influence the exit code.
21. **Node.** `engines` is `>=22.19.0` because `@apidevtools/swagger-parser` 13 requires it.
22. **Dependency justification.** Runtime dependencies: `@apidevtools/swagger-parser` only.
    `openapi-types` is a type-only peer of the parser and is installed as a dev dependency.

## Limitations

- Swagger 2.0, AsyncAPI and OpenAPI 3.2 are rejected with exit code `2`.
- Not analyzed (reported as `UNSUPPORTED_CONSTRUCT` when they differ): `oneOf`, `anyOf`, `not`,
  `if`/`then`/`else`, `patternProperties`, `dependentSchemas`, `dependentRequired`, `prefixItems`,
  `contains`, `propertyNames`, `unevaluatedProperties`, `unevaluatedItems`.
- `discriminator`, `xml`, `examples`, response headers, links, callbacks, webhooks, servers and
  security scheme definitions are not compared.
- Regex and `format` containment is not analyzed; changes are warnings.
- Response `additionalProperties` changes between `false` and "allowed" are not reported.
- `allOf` flattening is shallow (see Decisions 11).

## Output

All three formats list the same changes in the same order: operation path, then HTTP method,
then location, then rule ID, then message. Safe changes are counted in the summary but only listed
with `--include-safe`; ignored rules are removed before counting.

JSON (`schemaVersion: 1`):

```json
{
  "schemaVersion": 1,
  "tool": { "name": "specdiff", "version": "0.1.0" },
  "base": { "file": "...", "openapi": "3.0.3", "title": "...", "version": "..." },
  "head": { "file": "...", "openapi": "3.1.0", "title": "...", "version": "..." },
  "changes": [
    {
      "id": "RESP_PROPERTY_REMOVED",
      "severity": "breaking",
      "operation": "GET /users/{id}",
      "location": { "base": "paths./users/{id}.get...email", "head": null },
      "message": "200 application/json: property \"email\" removed"
    }
  ],
  "summary": { "breaking": 1, "warning": 0, "safe": 0, "info": 0, "total": 1, "hiddenSafe": 0 }
}
```

Unexpected internal errors exit with `2` and a message on stderr; they are never mistaken for
"changes found" (`1`).
