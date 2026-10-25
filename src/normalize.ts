import { SpecdiffError } from "./errors.js";
import {
  HTTP_METHODS,
  type ContentEntry,
  type HttpMethod,
  type JsonObject,
  type LoadedSpec,
  type NormalizedBody,
  type NormalizedOperation,
  type NormalizedParameter,
  type NormalizedPath,
  type NormalizedResponse,
  type NormalizedSpec,
  type Schema,
  type SecurityAlternative,
} from "./model.js";

export function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

// ---------------------------------------------------------------------------
// Paths, media types, status codes
// ---------------------------------------------------------------------------

/** `/users/{id}` and `/users/{userId}` share the shape `/users/{}`. */
export function pathShape(template: string): string {
  return template.replace(/\{[^}]*\}/g, "{}");
}

export function pathParamNames(template: string): string[] {
  return [...template.matchAll(/\{([^}]*)\}/g)].map((m) => m[1] ?? "");
}

/** Lower-case and drop parameters such as `; charset=utf-8`. */
export function normalizeMediaType(mediaType: string): string {
  return (mediaType.split(";")[0] ?? "").trim().toLowerCase();
}

export function normalizeStatus(status: string): string {
  return status.trim().toUpperCase() === "DEFAULT" ? "default" : status.trim().toUpperCase();
}

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

function parameterKey(param: JsonObject, paramNames: string[]): string {
  const location = String(param.in);
  const name = String(param.name);
  if (location === "path") {
    const index = paramNames.indexOf(name);
    // Path parameters are matched by template position so a rename is not a removal + addition.
    return index >= 0 ? `path:#${index}` : `path:${name}`;
  }
  return `${location}:${location === "header" ? name.toLowerCase() : name}`;
}

function serialization(param: JsonObject): string {
  if (isObject(param.content)) return "content";
  const location = String(param.in);
  const style =
    typeof param.style === "string"
      ? param.style
      : location === "query" || location === "cookie"
        ? "form"
        : "simple";
  const explode = typeof param.explode === "boolean" ? param.explode : style === "form";
  return `style=${style}, explode=${String(explode)}`;
}

function parameterSchema(param: JsonObject): Schema | undefined {
  if (isObject(param.schema)) return param.schema;
  if (isObject(param.content)) {
    const first = Object.values(param.content)[0];
    if (isObject(first) && isObject(first.schema)) return first.schema;
  }
  return undefined;
}

function normalizeParameter(param: JsonObject, paramNames: string[]): NormalizedParameter {
  const location = String(param.in);
  return {
    key: parameterKey(param, paramNames),
    name: String(param.name),
    in: location,
    required: location === "path" ? true : param.required === true,
    schema: parameterSchema(param),
    serialization: serialization(param),
  };
}

function mergeParameters(
  pathLevel: unknown,
  operationLevel: unknown,
  paramNames: string[],
): Map<string, NormalizedParameter> {
  const result = new Map<string, NormalizedParameter>();
  for (const list of [pathLevel, operationLevel]) {
    for (const param of asArray(list)) {
      if (!isObject(param)) continue;
      const normalized = normalizeParameter(param, paramNames);
      result.set(normalized.key, normalized); // operation-level wins
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Bodies, responses, security
// ---------------------------------------------------------------------------

function normalizeContent(content: unknown): Map<string, ContentEntry> {
  const result = new Map<string, ContentEntry>();
  if (!isObject(content)) return result;
  for (const [key, entry] of Object.entries(content)) {
    const schema = isObject(entry) && isObject(entry.schema) ? entry.schema : undefined;
    result.set(normalizeMediaType(key), { key, schema });
  }
  return result;
}

function normalizeBody(body: unknown): NormalizedBody | undefined {
  if (!isObject(body)) return undefined;
  return { required: body.required === true, content: normalizeContent(body.content) };
}

function normalizeResponses(responses: unknown): Map<string, NormalizedResponse> {
  const result = new Map<string, NormalizedResponse>();
  if (!isObject(responses)) return result;
  for (const [key, response] of Object.entries(responses)) {
    if (key.startsWith("x-")) continue;
    const content = isObject(response)
      ? normalizeContent(response.content)
      : new Map<string, ContentEntry>();
    result.set(normalizeStatus(key), { key, content });
  }
  return result;
}

/** Turn a `security` array into alternatives with sorted scopes. */
export function normalizeSecurity(security: unknown): SecurityAlternative[] {
  return asArray(security)
    .filter(isObject)
    .map((requirement) => {
      const entries = Object.entries(requirement)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([scheme, scopes]) => [scheme, asArray(scopes).map(String).sort()] as const);
      return new Map(entries);
    });
}

function normalizeOperation(
  method: HttpMethod,
  operation: JsonObject,
  pathItem: JsonObject,
  paramNames: string[],
  documentSecurity: SecurityAlternative[],
): NormalizedOperation {
  return {
    method,
    deprecated: operation.deprecated === true,
    parameters: mergeParameters(pathItem.parameters, operation.parameters, paramNames),
    requestBody: normalizeBody(operation.requestBody),
    responses: normalizeResponses(operation.responses),
    security: "security" in operation ? normalizeSecurity(operation.security) : documentSecurity,
  };
}

// ---------------------------------------------------------------------------
// Whole document
// ---------------------------------------------------------------------------

export function normalizeSpec(spec: LoadedSpec): NormalizedSpec {
  const paths = new Map<string, NormalizedPath>();
  const documentSecurity = normalizeSecurity(spec.document.security);
  const rawPaths = isObject(spec.document.paths) ? spec.document.paths : {};
  for (const [template, pathItem] of Object.entries(rawPaths)) {
    if (template.startsWith("x-") || !isObject(pathItem)) continue;
    const key = pathShape(template);
    const existing = paths.get(key);
    if (existing) {
      throw new SpecdiffError(
        `${spec.info.file}: paths "${existing.template}" and "${template}" have the same template shape and cannot be told apart`,
      );
    }
    const paramNames = pathParamNames(template);
    const operations = new Map<HttpMethod, NormalizedOperation>();
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (isObject(operation)) {
        operations.set(
          method,
          normalizeOperation(method, operation, pathItem, paramNames, documentSecurity),
        );
      }
    }
    paths.set(key, { key, template, paramNames, operations });
  }
  return { info: spec.info, paths };
}

// ---------------------------------------------------------------------------
// Schema view: flattening, types and nullability
// ---------------------------------------------------------------------------

/** Keywords SpecDiff does not analyze. A difference is reported as UNSUPPORTED_CONSTRUCT. */
export const UNSUPPORTED_KEYWORDS = [
  "oneOf",
  "anyOf",
  "not",
  "if",
  "then",
  "else",
  "patternProperties",
  "dependentSchemas",
  "dependentRequired",
  "prefixItems",
  "contains",
  "propertyNames",
  "unevaluatedProperties",
  "unevaluatedItems",
] as const;

/** Scalar constraints that have a direction (a bigger/smaller value is looser/tighter). */
export const SCALAR_CONSTRAINTS = [
  "maxLength",
  "minLength",
  "maxItems",
  "minItems",
  "maxProperties",
  "minProperties",
  "uniqueItems",
  "pattern",
  "format",
  "multipleOf",
] as const;

export interface Bound {
  value: number;
  exclusive: boolean;
}

export interface SchemaView {
  /** True when the schema places no restriction on the JSON type. */
  anyType: boolean;
  /** Non-null types. */
  types: Set<string>;
  nullable: boolean;
  properties: Map<string, Schema[]>;
  required: Set<string>;
  items: Schema[];
  /** `undefined` when absent; a list when constrained by a schema. */
  additionalProperties: boolean | Schema[] | undefined;
  /** Canonical JSON string -> value. `undefined` when the schema has no enum. */
  enumValues: Map<string, unknown> | undefined;
  constraints: Map<string, unknown>;
  upper: Bound | undefined;
  lower: Bound | undefined;
  readOnly: boolean;
  writeOnly: boolean;
  /** Unsupported keyword -> values collected from every `allOf` member. */
  unsupported: Map<string, unknown[]>;
}

/** Stable JSON that tolerates cycles; used for enum values and unsupported keyword comparison. */
export function canonicalJson(value: unknown): string {
  const stack: object[] = [];
  const walk = (v: unknown): string => {
    if (typeof v !== "object" || v === null) return JSON.stringify(v) ?? "undefined";
    if (stack.includes(v)) return '"[Circular]"';
    stack.push(v);
    let out: string;
    if (Array.isArray(v)) {
      out = `[${v.map(walk).join(",")}]`;
    } else {
      const keys = Object.keys(v).sort();
      out = `{${keys.map((k) => `${JSON.stringify(k)}:${walk((v as JsonObject)[k])}`).join(",")}}`;
    }
    stack.pop();
    return out;
  };
  return walk(value);
}

/** OpenAPI 3.1 allows boolean schemas. */
export function asSchema(value: unknown): Schema | undefined {
  if (isObject(value)) return value;
  if (value === true) return {};
  if (value === false) return { not: {} };
  return undefined;
}

function typeList(type: unknown): string[] {
  if (typeof type === "string") return [type];
  return asArray(type).filter((t): t is string => typeof t === "string");
}

function collectMembers(schema: Schema, seen: Set<Schema>, out: Schema[]): void {
  if (seen.has(schema)) return;
  seen.add(schema);
  for (const member of asArray(schema.allOf)) {
    const resolved = asSchema(member);
    if (resolved) collectMembers(resolved, seen, out);
  }
  out.push(schema);
}

function boundOf(
  schema: Schema,
  limit: "maximum" | "minimum",
  exclusiveKey: "exclusiveMaximum" | "exclusiveMinimum",
): Bound | undefined {
  const plain = schema[limit];
  const exclusive = schema[exclusiveKey];
  if (typeof exclusive === "number") {
    // 3.1 numeric form. If both are present the stricter one wins.
    const base = typeof plain === "number" ? plain : undefined;
    const upper = limit === "maximum";
    if (base !== undefined && (upper ? base < exclusive : base > exclusive)) {
      return { value: base, exclusive: false };
    }
    return { value: exclusive, exclusive: true };
  }
  if (typeof plain === "number") return { value: plain, exclusive: exclusive === true };
  return undefined;
}

const viewCache = new WeakMap<Schema, SchemaView>();

/** Flatten `allOf` and normalize types/nullability for one schema. */
export function describeSchema(schema: Schema): SchemaView {
  const cached = viewCache.get(schema);
  if (cached) return cached;
  const view = buildView(schema);
  viewCache.set(schema, view);
  return view;
}

function buildView(schema: Schema): SchemaView {
  const members: Schema[] = [];
  collectMembers(schema, new Set(), members);

  const view: SchemaView = {
    anyType: true,
    types: new Set(),
    nullable: false,
    properties: new Map(),
    required: new Set(),
    items: [],
    additionalProperties: undefined,
    enumValues: undefined,
    constraints: new Map(),
    upper: undefined,
    lower: undefined,
    readOnly: false,
    writeOnly: false,
    unsupported: new Map(),
  };
  let typed = false;
  let additionalFalse = false;
  let additionalTrue = false;
  const additionalSchemas: Schema[] = [];

  for (const member of members) {
    if (member.type !== undefined) {
      const declared = typeList(member.type);
      typed = true;
      view.types = new Set(declared.filter((t) => t !== "null"));
      view.nullable = declared.includes("null");
    }
    if (member.nullable === true) view.nullable = true;
    if (member.readOnly === true) view.readOnly = true;
    if (member.writeOnly === true) view.writeOnly = true;

    if (isObject(member.properties)) {
      for (const [name, prop] of Object.entries(member.properties)) {
        const resolved = asSchema(prop);
        if (!resolved) continue;
        const list = view.properties.get(name) ?? [];
        list.push(resolved);
        view.properties.set(name, list);
      }
    }
    for (const name of asArray(member.required)) view.required.add(String(name));
    const items = asSchema(member.items);
    if (items) view.items.push(items);

    if (member.additionalProperties === false) additionalFalse = true;
    else if (member.additionalProperties === true) additionalTrue = true;
    else if (isObject(member.additionalProperties))
      additionalSchemas.push(member.additionalProperties);

    const values = Array.isArray(member.enum)
      ? member.enum
      : "const" in member
        ? [member.const]
        : undefined;
    if (values) {
      const next = new Map(values.map((v) => [canonicalJson(v), v] as const));
      view.enumValues = view.enumValues
        ? new Map([...view.enumValues].filter(([k]) => next.has(k)))
        : next;
    }

    for (const key of SCALAR_CONSTRAINTS) {
      if (member[key] !== undefined) view.constraints.set(key, member[key]);
    }
    view.upper = boundOf(member, "maximum", "exclusiveMaximum") ?? view.upper;
    view.lower = boundOf(member, "minimum", "exclusiveMinimum") ?? view.lower;

    for (const key of UNSUPPORTED_KEYWORDS) {
      if (member[key] !== undefined) {
        view.unsupported.set(key, [...(view.unsupported.get(key) ?? []), member[key]]);
      }
    }
  }

  if (additionalFalse) view.additionalProperties = false;
  else if (additionalSchemas.length > 0) view.additionalProperties = additionalSchemas;
  else if (additionalTrue) view.additionalProperties = true;

  if (typed) {
    view.anyType = false;
  } else if (view.properties.size > 0 || view.additionalProperties !== undefined) {
    view.anyType = false;
    view.types = new Set(["object"]);
  } else if (view.items.length > 0) {
    view.anyType = false;
    view.types = new Set(["array"]);
  }
  return view;
}

/** Human-readable type of a schema view (nullability is reported separately). */
export function typeLabel(view: SchemaView): string {
  if (view.anyType) return "any";
  if (view.types.size === 0) return "null";
  return [...view.types].sort().join(" | ");
}
