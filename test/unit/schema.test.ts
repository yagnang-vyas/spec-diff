import { describe, expect, it } from "vitest";
import { diffDocs, requestDoc, responseDoc, summarize } from "../helpers.js";

const str = { type: "string" };

describe("additionalProperties", () => {
  it("recurses into value schemas", () => {
    const changes = diffDocs(
      responseDoc({ type: "object", additionalProperties: { type: "integer" } }),
      responseDoc({ type: "object", additionalProperties: { type: "string" } }),
    );
    expect(summarize(changes)).toEqual(["breaking TYPE_CHANGED"]);
    expect(changes[0]?.message).toBe(
      '200 application/json: type of "*" changed from integer to string',
    );
  });

  it("treats true/absent as any when a request gains a value schema", () => {
    const changes = diffDocs(
      requestDoc({ type: "object", additionalProperties: true }),
      requestDoc({ type: "object", additionalProperties: str }),
    );
    expect(summarize(changes)).toEqual(["breaking TYPE_CHANGED"]);
  });

  it("does not report response additionalProperties flips or identical true/absent", () => {
    expect(
      diffDocs(
        responseDoc({ type: "object", additionalProperties: false }),
        responseDoc({ type: "object", additionalProperties: true }),
      ),
    ).toEqual([]);
    expect(
      diffDocs(
        responseDoc({ type: "object", additionalProperties: false }),
        responseDoc({ type: "object", additionalProperties: false }),
      ),
    ).toEqual([]);
    expect(
      diffDocs(
        responseDoc({ type: "object" }),
        responseDoc({ type: "object", additionalProperties: true }),
      ),
    ).toEqual([]);
  });

  it("does not report request flips between true and absent", () => {
    expect(
      diffDocs(
        requestDoc({ type: "object" }),
        requestDoc({ type: "object", additionalProperties: true }),
      ),
    ).toEqual([]);
  });
});

describe("arrays and nesting", () => {
  it("addresses root array items as value[]", () => {
    const changes = diffDocs(
      responseDoc({ type: "array", items: { type: "integer" } }),
      responseDoc({ type: "array", items: { type: "string" } }),
    );
    expect(changes[0]?.message).toContain('type of "value[]"');
    expect(changes[0]?.location.head).toContain("schema.items");
  });

  it("compares nested array item properties", () => {
    const changes = diffDocs(
      responseDoc({
        type: "object",
        properties: { rows: { type: "array", items: { type: "object", properties: { id: str } } } },
      }),
      responseDoc({
        type: "object",
        properties: { rows: { type: "array", items: { type: "object", properties: {} } } },
      }),
    );
    expect(changes[0]?.message).toContain('property "rows[].id" removed');
  });

  it("stops at the depth guard instead of looping", () => {
    const nest = (depth: number, leaf: unknown): unknown =>
      depth === 0 ? leaf : { type: "object", properties: { n: nest(depth - 1, leaf) } };
    const changes = diffDocs(
      responseDoc(nest(120, str)),
      responseDoc(nest(120, { type: "integer" })),
    );
    expect(summarize(changes)).toEqual(["info UNSUPPORTED_CONSTRUCT"]);
    expect(changes[0]?.message).toContain("nesting deeper than 100 levels");
  });
});

describe("allOf", () => {
  it("compares properties declared by several members together", () => {
    const side = (max: number) =>
      responseDoc({
        allOf: [
          { type: "object", properties: { a: { type: "string" } } },
          { properties: { a: { maxLength: max } } },
        ],
      });
    const changes = diffDocs(side(5), side(9));
    expect(summarize(changes)).toEqual(["breaking RESP_CONSTRAINT_LOOSENED"]);
    expect(changes[0]?.message).toContain('maxLength of "a" loosened from 5 to 9');
  });
});

describe("types and nullability", () => {
  it("skips structural comparison when types are disjoint", () => {
    const changes = diffDocs(
      responseDoc({ type: "string", enum: ["a"], maxLength: 3 }),
      responseDoc({ type: "integer", enum: [1], maximum: 3 }),
    );
    expect(summarize(changes)).toEqual(["breaking TYPE_CHANGED"]);
  });

  it("does not compare nullability against untyped schemas", () => {
    expect(summarize(diffDocs(responseDoc({}), responseDoc({ type: ["string", "null"] })))).toEqual(
      ["safe TYPE_CHANGED"],
    );
  });

  it("handles a type-null-only schema", () => {
    expect(
      summarize(diffDocs(responseDoc({ type: "null" }), responseDoc({ type: ["string", "null"] }))),
    ).toEqual(["breaking TYPE_CHANGED"]);
  });

  it("reports both a type change and a nullability change", () => {
    const changes = diffDocs(
      requestDoc({ type: ["integer", "null"] }),
      requestDoc({ type: "number" }),
    );
    expect(summarize(changes).sort()).toEqual([
      "breaking REQ_BECAME_NON_NULLABLE",
      "safe TYPE_CHANGED",
    ]);
  });
});

describe("enums and constraints", () => {
  it("compares enum values canonically, including objects", () => {
    expect(
      diffDocs(
        responseDoc({ enum: [{ a: 1, b: 2 }, null] }),
        responseDoc({ enum: [{ b: 2, a: 1 }, null] }),
      ),
    ).toEqual([]);
    const changes = diffDocs(responseDoc({ const: "a" }), responseDoc({ enum: ["a", "b"] }));
    expect(summarize(changes)).toEqual(["warning RESP_ENUM_WIDENED"]);
  });

  it("reports both removed and added enum values", () => {
    const changes = diffDocs(
      requestDoc({ type: "string", enum: ["a", "b"] }),
      requestDoc({ type: "string", enum: ["b", "c"] }),
    );
    expect(summarize(changes)).toEqual(["breaking REQ_ENUM_NARROWED", "safe REQ_ENUM_WIDENED"]);
  });

  it("treats a lower bound of zero as the default", () => {
    expect(diffDocs(requestDoc(str), requestDoc({ type: "string", minLength: 0 }))).toEqual([]);
    expect(diffDocs(requestDoc(str), requestDoc({ type: "string", maxLength: 3 })).length).toBe(1);
  });

  it("ignores non-numeric garbage and unchanged opaque constraints", () => {
    expect(
      diffDocs(
        requestDoc({ type: "string", maxLength: "x", pattern: "^a", multipleOf: 2 }),
        requestDoc({ type: "string", maxLength: "y", pattern: "^a", multipleOf: 2 }),
      ),
    ).toEqual([]);
  });

  it("flags uniqueItems being switched off in a response as loosened", () => {
    const changes = diffDocs(
      responseDoc({ type: "array", items: str, uniqueItems: true }),
      responseDoc({ type: "array", items: str }),
    );
    expect(summarize(changes)).toEqual(["breaking RESP_CONSTRAINT_LOOSENED"]);
  });

  it("compares exclusive bounds in the 3.1 numeric form", () => {
    const changes = diffDocs(
      requestDoc({ type: "integer", exclusiveMaximum: 10 }),
      requestDoc({ type: "integer", exclusiveMaximum: 5 }),
    );
    expect(changes[0]?.message).toContain(
      "maximum of value tightened from 10 (exclusive) to 5 (exclusive)",
    );
    const loosened = diffDocs(
      requestDoc({ type: "integer", maximum: 10, exclusiveMaximum: true }),
      requestDoc({ type: "integer", maximum: 10 }),
    );
    expect(summarize(loosened)).toEqual(["safe REQ_CONSTRAINT_LOOSENED"]);
    const lowered = diffDocs(
      requestDoc({ type: "integer", minimum: 5 }),
      requestDoc({ type: "integer", minimum: 5, exclusiveMinimum: 1 }),
    );
    expect(lowered).toEqual([]);
  });
});

describe("unsupported constructs", () => {
  it("reports each differing keyword once", () => {
    const changes = diffDocs(
      responseDoc({ oneOf: [str], not: str }),
      responseDoc({ oneOf: [{ type: "integer" }], anyOf: [str] }),
    );
    expect(changes.map((c) => c.message)).toEqual([
      '200 application/json: "anyOf" differs between versions at value (not analyzed, review manually)',
      '200 application/json: "not" differs between versions at value (not analyzed, review manually)',
      '200 application/json: "oneOf" differs between versions at value (not analyzed, review manually)',
    ]);
  });

  it("still analyzes the other keywords of the same schema", () => {
    const changes = diffDocs(
      responseDoc({ type: "object", properties: { a: str, b: str }, oneOf: [str] }),
      responseDoc({ type: "object", properties: { a: str }, oneOf: [{ type: "integer" }] }),
    );
    expect(summarize(changes).sort()).toEqual([
      "breaking RESP_PROPERTY_REMOVED",
      "info UNSUPPORTED_CONSTRUCT",
    ]);
  });
});

describe("request/response asymmetry", () => {
  it("never reports a stricter response as breaking", () => {
    const changes = diffDocs(
      responseDoc({
        type: "object",
        properties: { a: { type: "string", nullable: true, maxLength: 9 } },
        required: [],
      }),
      responseDoc({
        type: "object",
        properties: { a: { type: "string", maxLength: 3 } },
        required: ["a"],
      }),
    );
    expect(changes.every((c) => c.severity === "safe")).toBe(true);
    expect(changes.length).toBe(3);
  });

  it("never reports a looser request as breaking", () => {
    const changes = diffDocs(
      requestDoc({
        type: "object",
        properties: { a: { type: "string", maxLength: 3 } },
        required: ["a"],
        additionalProperties: false,
      }),
      requestDoc({
        type: "object",
        properties: { a: { type: ["string", "null"], maxLength: 9 } },
        additionalProperties: true,
      }),
    );
    expect(changes.every((c) => c.severity === "safe")).toBe(true);
    expect(changes.length).toBe(4);
  });
});

describe("operation-level details", () => {
  it("handles media types without schemas and mismatched presence", () => {
    const base = {
      paths: {
        "/a": {
          get: { responses: { "200": { description: "x", content: { "text/plain": {} } } } },
        },
      },
    };
    const head = responseDoc({ type: "string" });
    const changes = diffDocs(base, head);
    expect(summarize(changes).sort()).toEqual(
      ["safe RESP_MEDIA_TYPE_ADDED", "breaking RESP_MEDIA_TYPE_REMOVED"].sort(),
    );
  });

  it("reads parameter schemas from content and reports the right location", () => {
    const doc = (max: number) => ({
      paths: {
        "/a": {
          get: {
            parameters: [
              {
                name: "q",
                in: "query",
                content: { "application/json": { schema: { type: "integer", maximum: max } } },
              },
            ],
            responses: { "200": { description: "ok" } },
          },
        },
      },
    });
    const changes = diffDocs(doc(10), doc(5));
    expect(changes[0]?.location.head).toBe(
      "paths./a.get.parameters.query.q.content.application/json.schema",
    );
  });

  it("matches headers case-insensitively and detects a moved parameter regardless of case", () => {
    const withParams = (parameters: unknown[]) => ({
      paths: { "/a": { get: { parameters, responses: { "200": { description: "ok" } } } } },
    });
    const header = (name: string) => ({ name, in: "header", schema: str });
    expect(diffDocs(withParams([header("X-Key")]), withParams([header("x-key")]))).toEqual([]);
    const moved = diffDocs(
      withParams([header("X-Key")]),
      withParams([{ name: "x-key", in: "query", schema: str }]),
    );
    expect(summarize(moved)).toEqual(["breaking PARAM_LOCATION_CHANGED"]);
  });

  it("does not report a response that gained content with no matching schema change", () => {
    const base = { paths: { "/a": { get: { responses: { "200": { description: "x" } } } } } };
    const changes = diffDocs(base, responseDoc({ type: "object" }));
    expect(summarize(changes)).toEqual(["safe RESP_MEDIA_TYPE_ADDED"]);
  });

  it("reports media types that differ only by parameters as the same type", () => {
    const base = {
      paths: {
        "/a": {
          get: {
            responses: {
              "200": {
                description: "x",
                content: { "application/json; charset=utf-8": { schema: str } },
              },
            },
          },
        },
      },
    };
    expect(diffDocs(base, responseDoc(str))).toEqual([]);
  });
});

describe("shared and cyclic structures", () => {
  it("compares an unchanged diamond-shaped schema once, not once per path", () => {
    const build = (leaf: unknown): unknown => {
      let level: unknown = leaf;
      for (let i = 0; i < 40; i += 1) {
        level = { type: "object", properties: { a: level, b: level } };
      }
      return level;
    };
    const started = Date.now();
    expect(diffDocs(responseDoc(build(str)), responseDoc(build(str)))).toEqual([]);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it("reports a change in a shared schema at every location that uses it", () => {
    const shared = (max: number) => ({ type: "string", maxLength: max });
    const doc = (max: number) =>
      responseDoc({ type: "object", properties: { a: shared(max), b: shared(max) } });
    const changes = diffDocs(doc(3), doc(9));
    expect(changes.map((c) => c.location.head?.split(".").pop())).toEqual(["a", "b"]);
  });

  it("terminates on self-referencing allOf and oneOf", () => {
    const make = (maxLength: number) => {
      const node: Record<string, unknown> = {
        type: "object",
        properties: { v: { type: "string", maxLength } },
      };
      node.allOf = [node];
      node.oneOf = [node, str];
      (node.properties as Record<string, unknown>).next = node;
      return node;
    };
    const changes = diffDocs(responseDoc(make(5)), responseDoc(make(8)));
    // the nested oneOf contains the changed node, so it differs too
    expect(summarize(changes).sort()).toEqual([
      "breaking RESP_CONSTRAINT_LOOSENED",
      "info UNSUPPORTED_CONSTRUCT",
    ]);
  });

  it("terminates when the recursion shapes differ between versions", () => {
    const base: Record<string, unknown> = { type: "object", properties: {} };
    (base.properties as Record<string, unknown>).next = base;
    const head: Record<string, unknown> = { type: "object", properties: {} };
    const link: Record<string, unknown> = {
      type: "object",
      properties: { n: { type: "integer" } },
    };
    (link.properties as Record<string, unknown>).next = link;
    (head.properties as Record<string, unknown>).next = link;
    expect(summarize(diffDocs(responseDoc(base), responseDoc(head)))).toEqual([
      "safe RESP_PROPERTY_ADDED",
    ]);
  });
});
