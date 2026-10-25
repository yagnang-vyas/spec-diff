import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compareFiles } from "../../src/diff/index";
import { buildView, compareTexts, InputErrors, MAX_INPUT_BYTES, parseIgnore } from "../src/engine";
import { EXAMPLES } from "../src/examples";

const root = join(import.meta.dirname, "..", "..");
const fixtures = join(root, "test", "fixtures");
const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8");

describe("parity with the core engine", () => {
  // Fixtures without a base/head pair (_loading, _normalize) are not comparisons, and _cross-file
  // depends on relative file $refs, which a browser cannot resolve (see "input handling").
  const dirs = readdirSync(fixtures).filter(
    (dir) => existsSync(join(fixtures, dir, "head.yaml")) && dir !== "_cross-file",
  );

  it("covers the whole fixture corpus", () => {
    expect(dirs.length).toBeGreaterThan(50);
  });

  it.each(dirs)("fixture %s yields the same changes as the CLI loader", async (dir) => {
    const base = join(fixtures, dir, "base.yaml");
    const head = join(fixtures, dir, "head.yaml");
    const expected = (await compareFiles(base, head)).changes;
    const actual = (await compareTexts(readFileSync(base, "utf8"), readFileSync(head, "utf8")))
      .changes;
    expect(actual).toEqual(expected);
  });

  it("reproduces the bookstore golden JSON report", async () => {
    const comparison = await compareTexts(
      read("examples", "bookstore", "v1.yaml"),
      read("examples", "bookstore", "v2.yaml"),
    );
    const view = buildView(comparison, { includeSafe: true, failOn: "breaking", ignore: "" });
    const golden = JSON.parse(read("test", "golden", "bookstore.json")) as {
      changes: unknown;
      summary: unknown;
    };
    const actual = JSON.parse(view.json) as typeof golden;
    expect(actual.changes).toEqual(golden.changes);
    expect(actual.summary).toEqual(golden.summary);
  });

  it("reproduces the bookstore golden text body", async () => {
    const comparison = await compareTexts(
      read("examples", "bookstore", "v1.yaml"),
      read("examples", "bookstore", "v2.yaml"),
    );
    const view = buildView(comparison, { includeSafe: false, failOn: "breaking", ignore: "" });
    const body = (text: string) => text.slice(text.indexOf("\nPOST /authors"));
    expect(body(view.text)).toBe(body(read("test", "golden", "bookstore.txt")));
  });
});

describe("examples", () => {
  it("orders example reports the documented breaking changes", async () => {
    const example = EXAMPLES[0]!;
    const comparison = await compareTexts(example.before, example.after);
    const view = buildView(comparison, { includeSafe: true, failOn: "breaking", ignore: "" });
    const ids = view.changes.map((c) => c.id);
    expect(ids).toContain("PARAM_BECAME_REQUIRED");
    expect(ids).toContain("REQ_PROPERTY_REQUIRED_ADDED");
    expect(ids).toContain("REQ_CONSTRAINT_TIGHTENED");
    expect(ids).toContain("RESP_STATUS_REMOVED");
    expect(ids).toContain("RESP_PROPERTY_REMOVED");
    expect(ids).toContain("OP_REMOVED");
    expect(ids).toContain("PATH_ADDED");
    expect(view.exitCode).toBe(1);
    expect(view.summary.total).toBe(view.changes.length);
  });

  it("the nullable example has no changes", async () => {
    const example = EXAMPLES.find((e) => e.id === "nullable")!;
    const view = buildView(await compareTexts(example.before, example.after), {
      includeSafe: true,
      failOn: "never",
      ignore: "",
    });
    expect(view.changes).toEqual([]);
    expect(view.text).toContain("No API changes detected.");
  });
});

describe("options", () => {
  it("computes the exit code from --fail-on semantics", async () => {
    const e = EXAMPLES[0]!;
    const comparison = await compareTexts(e.before, e.after);
    const run = (failOn: "breaking" | "warning" | "never", ignore = "") =>
      buildView(comparison, { includeSafe: false, failOn, ignore }).exitCode;
    expect(run("breaking")).toBe(1);
    expect(run("never")).toBe(0);
    const breaking = new Set(
      comparison.changes.filter((c) => c.severity === "breaking").map((c) => c.id),
    );
    expect(run("breaking", [...breaking].join(","))).toBe(0);
    expect(run("warning", [...breaking].join(","))).toBe(1);
  });

  it("rejects unknown ignore IDs", () => {
    expect(() => parseIgnore("NOT_A_RULE")).toThrow(/unknown rule ID/);
    expect([...parseIgnore("OP_REMOVED, PATH_ADDED")]).toEqual(["OP_REMOVED", "PATH_ADDED"]);
    expect(parseIgnore("").size).toBe(0);
  });
});

describe("input handling", () => {
  const valid = EXAMPLES[2]!.before;

  async function problems(before: string, after: string) {
    try {
      await compareTexts(before, after);
    } catch (error) {
      expect(error).toBeInstanceOf(InputErrors);
      return (error as InputErrors).problems;
    }
    throw new Error("expected a failure");
  }

  it("reports empty input per side", async () => {
    expect(await problems("  \n", valid)).toEqual([
      { side: "before", message: "the specification is empty" },
    ]);
    expect((await problems("", "")).map((p) => p.side)).toEqual(["before", "after"]);
  });

  it("reports malformed YAML", async () => {
    const [p] = await problems(valid, "openapi: 3.0.3\n  bad: [unclosed");
    expect(p?.side).toBe("after");
    expect(p?.message).toMatch(/not valid YAML or JSON/);
  });

  it("reports scalars and arrays", async () => {
    expect((await problems("just text", valid))[0]?.message).toMatch(/mapping/);
    expect((await problems("- a\n- b", valid))[0]?.message).toMatch(/mapping/);
  });

  it("rejects Swagger 2.0 as unsupported", async () => {
    const swagger = 'swagger: "2.0"\ninfo: {title: t, version: "1"}\npaths: {}\n';
    const [p] = await problems(swagger, valid);
    expect(p?.message).toMatch(/unsupported specification/);
  });

  it("rejects documents that are not valid OpenAPI", async () => {
    const [p] = await problems("openapi: 3.0.3\ninfo: {title: t}\npaths: {}\n", valid);
    expect(p?.side).toBe("before");
    expect(p?.message.length).toBeGreaterThan(0);
  });

  it("rejects external references instead of fetching them", async () => {
    const external = `openapi: 3.0.3
info: {title: t, version: "1"}
paths:
  /a:
    get:
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema: {$ref: "./other.yaml#/Thing"}
`;
    const [p] = await problems(external, valid);
    expect(p?.side).toBe("before");
  });

  it("rejects oversized input without parsing it", async () => {
    const big = `openapi: 3.0.3\n# ${"x".repeat(MAX_INPUT_BYTES)}\n`;
    const [p] = await problems(big, valid);
    expect(p?.message).toMatch(/accepts up to 1 MB/);
  });

  it("accepts JSON input", async () => {
    const json = JSON.stringify({
      openapi: "3.1.0",
      info: { title: "t", version: "1" },
      paths: { "/a": { get: { responses: { "200": { description: "ok" } } } } },
    });
    const comparison = await compareTexts(json, json);
    expect(comparison.changes).toEqual([]);
  });

  it("identical inputs produce no changes", async () => {
    const e = EXAMPLES[0]!;
    expect((await compareTexts(e.before, e.before)).changes).toEqual([]);
  });
});
