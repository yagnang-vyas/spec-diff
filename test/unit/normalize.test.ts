import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSpec } from "../../src/load.js";
import { SpecdiffError } from "../../src/errors.js";
import type { LoadedSpec, Schema } from "../../src/model.js";
import {
  asSchema,
  canonicalJson,
  describeSchema,
  normalizeMediaType,
  normalizeSecurity,
  normalizeSpec,
  normalizeStatus,
  pathParamNames,
  pathShape,
  typeLabel,
} from "../../src/normalize.js";

const fixture = (...parts: string[]) => resolve(import.meta.dirname, "../fixtures", ...parts);

describe("paths", () => {
  it("maps templates to their shape", () => {
    expect(pathShape("/users/{id}")).toBe("/users/{}");
    expect(pathShape("/users/{userId}")).toBe(pathShape("/users/{id}"));
    expect(pathShape("/a/{x}/b/{y}")).toBe("/a/{}/b/{}");
    expect(pathParamNames("/a/{x}/b/{y}")).toEqual(["x", "y"]);
  });

  it("normalizes media types and statuses", () => {
    expect(normalizeMediaType("Application/JSON; charset=UTF-8")).toBe("application/json");
    expect(normalizeStatus("2xx")).toBe("2XX");
    expect(normalizeStatus("default")).toBe("default");
    expect(normalizeStatus("Default")).toBe("default");
  });

  it("rejects two paths with the same shape", async () => {
    const spec = await loadSpec(fixture("_loading/duplicate-shape.yaml"));
    expect(() => normalizeSpec(spec)).toThrow(SpecdiffError);
    expect(() => normalizeSpec(spec)).toThrow(/same template shape/);
  });
});

describe("parameters", () => {
  it("merges path-level parameters, with operation-level winning, and keys headers case-insensitively", async () => {
    const spec = normalizeSpec(await loadSpec(fixture("_normalize/params.yaml")));
    const path = spec.paths.get("/users/{}/orders/{}");
    expect(path?.template).toBe("/users/{userId}/orders/{orderId}");
    const op = path?.operations.get("get");
    expect([...(op?.parameters.keys() ?? [])].sort()).toEqual([
      "cookie:tags",
      "header:x-request-id",
      "path:#0",
      "path:#1",
      "query:filter",
      "query:ids",
      "query:limit",
    ]);
    // operation-level `limit` (required, maximum 50) replaced the path-level one
    expect(op?.parameters.get("query:limit")?.required).toBe(true);
    expect(op?.parameters.get("query:limit")?.schema?.maximum).toBe(50);
    // the header was declared twice with different casing: one parameter remains
    expect(op?.parameters.get("header:x-request-id")?.name).toBe("x-request-id");
    // path parameters are always required
    expect(op?.parameters.get("path:#0")?.required).toBe(true);
  });

  it("computes effective serialization", async () => {
    const spec = normalizeSpec(await loadSpec(fixture("_normalize/params.yaml")));
    const params = spec.paths.get("/users/{}/orders/{}")?.operations.get("get")?.parameters;
    expect(params?.get("query:ids")?.serialization).toBe("style=form, explode=true");
    expect(params?.get("path:#0")?.serialization).toBe("style=simple, explode=false");
    expect(params?.get("header:x-request-id")?.serialization).toBe("style=simple, explode=false");
    expect(params?.get("query:filter")?.serialization).toBe("style=deepObject, explode=true");
    expect(params?.get("cookie:tags")?.serialization).toBe("style=form, explode=true");
  });

  it("normalizes response status keys", async () => {
    const spec = normalizeSpec(await loadSpec(fixture("_normalize/params.yaml")));
    const responses = spec.paths.get("/users/{}/orders/{}")?.operations.get("get")?.responses;
    expect([...(responses?.keys() ?? [])]).toEqual(["200", "2XX", "default"]);
    expect(responses?.get("2XX")?.key).toBe("2XX");
  });
});

function spec(document: Record<string, unknown>): LoadedSpec {
  return { info: { file: "inline", openapi: "3.1.0", title: "", version: "" }, document };
}

describe("document-level handling", () => {
  it("inherits document security unless the operation overrides it", () => {
    const normalized = normalizeSpec(
      spec({
        security: [{ key: [] }],
        paths: {
          "/a": { get: { responses: {} } },
          "/b": { get: { security: [], responses: {} } },
          "/c": { get: { security: [{ oauth: ["write", "read"] }], responses: {} } },
          "x-ignored": {},
        },
      }),
    );
    const sec = (p: string) => normalized.paths.get(p)?.operations.get("get")?.security;
    expect(sec("/a")).toEqual([new Map([["key", []]])]);
    expect(sec("/b")).toEqual([]);
    expect(sec("/c")).toEqual([new Map([["oauth", ["read", "write"]]])]);
    expect(normalized.paths.size).toBe(3);
  });

  it("tolerates missing sections", () => {
    expect(normalizeSpec(spec({})).paths.size).toBe(0);
    const op = normalizeSpec(
      spec({ paths: { "/a": { put: { deprecated: true, requestBody: "bad" } } } }),
    )
      .paths.get("/a")
      ?.operations.get("put");
    expect(op?.deprecated).toBe(true);
    expect(op?.requestBody).toBeUndefined();
    expect(op?.responses.size).toBe(0);
  });

  it("reads parameter schemas from content and skips malformed entries", () => {
    const normalized = normalizeSpec(
      spec({
        paths: {
          "/a": {
            get: {
              parameters: [
                "junk",
                {
                  name: "q",
                  in: "query",
                  content: { "application/json": { schema: { type: "string" } } },
                },
                { name: "r", in: "query", content: { "application/json": {} } },
                { name: "ghost", in: "path", required: true },
              ],
              responses: {
                "200": { description: "x", content: { "application/json": {} } },
                "x-ext": {},
              },
            },
          },
        },
      }),
    );
    const op = normalized.paths.get("/a")?.operations.get("get");
    expect(op?.parameters.get("query:q")?.schema).toEqual({ type: "string" });
    expect(op?.parameters.get("query:q")?.serialization).toBe("content");
    expect(op?.parameters.get("query:r")?.schema).toBeUndefined();
    expect(op?.parameters.get("path:ghost")?.required).toBe(true);
    expect(op?.responses.get("200")?.content.get("application/json")?.schema).toBeUndefined();
    expect(op?.responses.has("X-EXT")).toBe(false);
  });

  it("normalizes security requirements", () => {
    expect(normalizeSecurity(undefined)).toEqual([]);
    expect(normalizeSecurity([{}, { b: ["y", "x"], a: [] }])).toEqual([
      new Map(),
      new Map([
        ["a", []],
        ["b", ["x", "y"]],
      ]),
    ]);
  });
});

describe("schema nullability and types", () => {
  const view = (schema: Schema) => describeSchema(schema);

  it("treats 3.0 nullable and 3.1 type arrays identically", () => {
    const v30 = view({ type: "string", nullable: true });
    const v31 = view({ type: ["string", "null"] });
    expect(v30.nullable).toBe(true);
    expect(v31.nullable).toBe(true);
    expect([...v30.types]).toEqual([...v31.types]);
    expect(typeLabel(v30)).toBe("string");
    expect(view({ type: "string" }).nullable).toBe(false);
  });

  it("handles type null, any, and inferred types", () => {
    expect(typeLabel(view({ type: "null" }))).toBe("null");
    expect(view({ type: "null" }).nullable).toBe(true);
    expect(typeLabel(view({}))).toBe("any");
    expect(typeLabel(view({ properties: { a: {} } }))).toBe("object");
    expect(typeLabel(view({ additionalProperties: true }))).toBe("object");
    expect(typeLabel(view({ items: {} }))).toBe("array");
    expect(typeLabel(view({ type: ["string", "integer"] }))).toBe("integer | string");
  });

  it("flattens allOf members", () => {
    const base = { type: "object", required: ["id"], properties: { id: { type: "string" } } };
    const v = view({
      allOf: [
        base,
        { required: ["name"], properties: { name: { type: "string" }, id: { maxLength: 4 } } },
      ],
      description: "x",
    });
    expect([...v.required].sort()).toEqual(["id", "name"]);
    expect(v.properties.get("id")).toHaveLength(2);
    expect(typeLabel(v)).toBe("object");
  });

  it("survives allOf cycles", () => {
    const a: Schema = { type: "object" };
    a.allOf = [a, { properties: { x: { type: "string" } } }];
    expect([...describeSchema(a).properties.keys()]).toEqual(["x"]);
  });

  it("merges enums by intersection and treats const as a single value", () => {
    const v = view({ allOf: [{ enum: ["a", "b"] }, { enum: ["b", "c"] }] });
    expect([...(v.enumValues?.values() ?? [])]).toEqual(["b"]);
    expect([...(view({ const: "x" }).enumValues?.values() ?? [])]).toEqual(["x"]);
    expect(view({ type: "string" }).enumValues).toBeUndefined();
  });

  it("normalizes numeric bounds from both exclusive forms", () => {
    expect(view({ maximum: 5, exclusiveMaximum: true }).upper).toEqual({
      value: 5,
      exclusive: true,
    });
    expect(view({ minimum: 1 }).lower).toEqual({ value: 1, exclusive: false });
    expect(view({ exclusiveMinimum: 3 }).lower).toEqual({ value: 3, exclusive: true });
    expect(view({ maximum: 2, exclusiveMaximum: 5 }).upper).toEqual({ value: 2, exclusive: false });
    expect(view({ minimum: 9, exclusiveMinimum: 5 }).lower).toEqual({ value: 9, exclusive: false });
    expect(view({ maximum: 9, exclusiveMaximum: 5 }).upper).toEqual({ value: 5, exclusive: true });
    expect(view({ type: "integer" }).upper).toBeUndefined();
  });

  it("resolves additionalProperties across allOf with false winning", () => {
    expect(view({ additionalProperties: false }).additionalProperties).toBe(false);
    expect(view({ additionalProperties: true }).additionalProperties).toBe(true);
    expect(view({ additionalProperties: { type: "string" } }).additionalProperties).toEqual([
      { type: "string" },
    ]);
    expect(
      view({ allOf: [{ additionalProperties: false }, { additionalProperties: true }] })
        .additionalProperties,
    ).toBe(false);
    expect(view({ type: "object" }).additionalProperties).toBeUndefined();
  });

  it("records read/write-only flags and unsupported keywords", () => {
    const v = view({
      readOnly: true,
      writeOnly: true,
      oneOf: [{ type: "string" }],
      allOf: [{ oneOf: [{}] }],
    });
    expect(v.readOnly && v.writeOnly).toBe(true);
    expect(v.unsupported.get("oneOf")).toHaveLength(2);
  });

  it("caches views per schema object", () => {
    const schema: Schema = { type: "string" };
    expect(describeSchema(schema)).toBe(describeSchema(schema));
  });

  it("converts boolean schemas", () => {
    expect(asSchema(true)).toEqual({});
    expect(asSchema(false)).toEqual({ not: {} });
    expect(asSchema("nope")).toBeUndefined();
    expect(view({ properties: { a: true, b: 7 } }).properties.size).toBe(1);
  });
});

describe("canonicalJson", () => {
  it("is key-order independent and cycle safe", () => {
    expect(canonicalJson({ b: 1, a: [1, { d: 1, c: 2 }] })).toBe(
      canonicalJson({ a: [1, { c: 2, d: 1 }], b: 1 }),
    );
    const cyc: Record<string, unknown> = { a: 1 };
    cyc.self = cyc;
    expect(canonicalJson(cyc)).toContain("[Circular]");
    expect(canonicalJson(undefined)).toBe("undefined");
    expect(canonicalJson(null)).toBe("null");
  });
});
