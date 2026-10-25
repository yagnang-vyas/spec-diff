import { describe, expect, it } from "vitest";
import { excerpt, locate } from "../src/locate";

const doc = {
  paths: {
    "/v1.0/items/{id}": {
      get: { parameters: [{ in: "query", name: "limit", schema: { type: "integer" } }] },
    },
  },
};

describe("locate", () => {
  it("resolves keys that contain dots", () => {
    expect(locate(doc, "paths./v1.0/items/{id}.get")).toEqual({
      found: true,
      value: doc.paths["/v1.0/items/{id}"].get,
    });
  });

  it("resolves parameters by location and name", () => {
    expect(locate(doc, "paths./v1.0/items/{id}.get.parameters.query.limit")).toMatchObject({
      found: true,
      value: { name: "limit" },
    });
  });

  it("reports unresolvable and missing locations", () => {
    expect(locate(doc, "paths.nope")).toEqual({ found: false });
    expect(locate(doc, null)).toEqual({ found: false });
  });
});

describe("excerpt", () => {
  it("survives cycles and truncates", () => {
    const node: Record<string, unknown> = { name: "n" };
    node.self = node;
    expect(excerpt(node)).toContain("[circular]");
    expect(excerpt({ a: "x".repeat(10_000) }, 6, 100)).toContain("(truncated)");
    expect(excerpt({ a: { b: { c: 1 } } }, 2)).toContain("{…}");
  });
});
