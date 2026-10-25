import { describe, expect, it } from "vitest";
import type { Change } from "../../src/diff/context.js";
import { escapeMarkdown, renderMarkdown } from "../../src/report/markdown.js";
import { describeSpec, groupByOperation, summarize, type Report } from "../../src/report/index.js";
import { renderText } from "../../src/report/text.js";

const info = { file: "a.yaml", openapi: "3.1.0", title: "", version: "" };

function report(changes: Change[], includeSafe = false): Report {
  return {
    tool: { name: "specdiff", version: "9.9.9" },
    base: info,
    head: { ...info, file: "b.yaml", title: "API", version: "2" },
    changes,
    includeSafe,
  };
}

const change = (over: Partial<Change> = {}): Change => ({
  id: "OP_REMOVED",
  severity: "breaking",
  operation: "GET /a",
  location: { base: "paths./a.get", head: null },
  message: "operation GET /a removed",
  ...over,
});

describe("markdown escaping", () => {
  it("escapes characters that break tables or render as markup", () => {
    expect(escapeMarkdown("a|b <i>&</i> *x* _y_ `z` [l]\nnext")).toBe(
      "a\\|b &lt;i&gt;&amp;&lt;/i&gt; \\*x\\* \\_y\\_ \\`z\\` \\[l\\] next",
    );
  });

  it("keeps rows intact when messages contain pipes and backticks", () => {
    const out = renderMarkdown(
      report([change({ operation: "GET /we`ird|path", message: 'enum | "a|b"' })]),
    );
    expect(out).toContain("### `` GET /we`ird\\|path ``");
    expect(out).toContain('enum \\| "a\\|b"');
  });

  it("shows the hidden-safe note only when safe changes are hidden", () => {
    const safe = change({ severity: "safe", id: "OP_ADDED", message: "operation added" });
    expect(renderMarkdown(report([safe]))).toContain("| Safe | 1 (hidden) |");
    expect(renderMarkdown(report([safe], true))).toContain("| Safe | 1 |");
    expect(renderMarkdown(report([]))).toContain("| Safe | 0 |");
  });
});

describe("text report", () => {
  it("aligns columns and groups by operation", () => {
    const out = renderText(
      report([
        change(),
        change({
          id: "OP_DEPRECATED",
          severity: "warning",
          message: "operation is now deprecated",
        }),
        change({ operation: "GET /b", id: "PATH_REMOVED", message: "path /b removed" }),
      ]),
    );
    expect(out).toBe(
      [
        "specdiff 9.9.9",
        "base: a.yaml (OpenAPI 3.1.0)",
        "head: b.yaml (API 2, OpenAPI 3.1.0)",
        "",
        "GET /a",
        "  BREAKING  OP_REMOVED     operation GET /a removed",
        "  WARNING   OP_DEPRECATED  operation is now deprecated",
        "",
        "GET /b",
        "  BREAKING  PATH_REMOVED   path /b removed",
        "",
        "Summary: 2 breaking, 1 warning, 0 info",
        "",
      ].join("\n"),
    );
  });
});

describe("helpers", () => {
  it("summarizes and groups", () => {
    const changes = [change(), change({ severity: "info" }), change({ operation: "GET /b" })];
    expect(summarize(changes)).toEqual({ breaking: 2, warning: 0, safe: 0, info: 1, total: 3 });
    expect(groupByOperation(changes).map(([op, list]) => [op, list.length])).toEqual([
      ["GET /a", 2],
      ["GET /b", 1],
    ]);
    expect(describeSpec(info)).toBe("a.yaml (OpenAPI 3.1.0)");
  });
});
