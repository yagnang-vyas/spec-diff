import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { cli, example } from "./helpers.js";

const golden = (name: string) => resolve(import.meta.dirname, "../golden", name);
const update = process.env.UPDATE_GOLDEN === "1";

function check(name: string, actual: string) {
  if (update || !existsSync(golden(name))) writeFileSync(golden(name), actual);
  expect(actual).toBe(readFileSync(golden(name), "utf8"));
}

describe("bookstore end to end", () => {
  const v1 = example("v1.yaml");
  const v2 = example("v2.yaml");

  it("matches the golden JSON report (including safe changes)", async () => {
    const r = await cli(v1, v2, "--format", "json", "--include-safe");
    expect(r.code).toBe(1);
    check("bookstore.json", r.out);
  });

  it("matches the golden text report", async () => {
    const r = await cli(v1, v2);
    expect(r.code).toBe(1);
    check("bookstore.txt", r.out);
  });

  it("matches the golden Markdown report", async () => {
    const r = await cli(v1, v2, "--format", "markdown");
    expect(r.code).toBe(1);
    check("bookstore.md", r.out);
  });

  it("covers a broad mix of changes", async () => {
    const json = JSON.parse((await cli(v1, v2, "--format", "json", "--include-safe")).out) as {
      changes: { id: string; severity: string }[];
      summary: { breaking: number; warning: number; safe: number; info: number };
    };
    const severities = new Set(json.changes.map((c) => c.severity));
    expect([...severities].sort()).toEqual(["breaking", "info", "safe", "warning"]);
    expect(new Set(json.changes.map((c) => c.id)).size).toBeGreaterThanOrEqual(12);
  });

  it("finds nothing when comparing the example with itself", async () => {
    expect((await cli(v1, v1, "--include-safe")).code).toBe(0);
    expect((await cli(v2, v2, "--include-safe")).code).toBe(0);
  });

  it("has about thirty operations", () => {
    const text = readFileSync(
      resolve(import.meta.dirname, "../../examples/bookstore/v1.yaml"),
      "utf8",
    );
    expect(text.match(/^\s+operationId:/gm)?.length).toBeGreaterThanOrEqual(30);
  });
});
