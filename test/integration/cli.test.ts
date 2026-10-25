import { describe, expect, it } from "vitest";
import { RULE_IDS } from "../../src/rules.js";
import { cli, example, fixture } from "./helpers.js";

const v1 = example("v1.yaml");
const v2 = example("v2.yaml");
const removedParam = [fixture("PARAM_REMOVED/base.yaml"), fixture("PARAM_REMOVED/head.yaml")];
const added = [fixture("PATH_ADDED/base.yaml"), fixture("PATH_ADDED/head.yaml")];

describe("exit codes", () => {
  it("exits 0 when nothing changed", async () => {
    const r = await cli(v1, v1);
    expect(r.code).toBe(0);
    expect(r.out).toContain("No API changes detected.");
  });

  it("exits 1 when breaking changes exist", async () => {
    expect((await cli(v1, v2)).code).toBe(1);
  });

  it("honours --fail-on", async () => {
    // PARAM_REMOVED is a warning
    expect((await cli(...removedParam)).code).toBe(0);
    expect((await cli(...removedParam, "--fail-on", "warning")).code).toBe(1);
    expect((await cli(...removedParam, "--fail-on", "never")).code).toBe(0);
    expect((await cli(v1, v2, "--fail-on", "never")).code).toBe(0);
    expect((await cli(...added, "--fail-on", "warning")).code).toBe(0);
  });

  it("does not fail on safe or info changes", async () => {
    expect((await cli(...added, "--include-safe", "--fail-on", "warning")).code).toBe(0);
    const rename = [
      fixture("PATH_PARAM_RENAMED/base.yaml"),
      fixture("PATH_PARAM_RENAMED/head.yaml"),
    ];
    const r = await cli(...rename, "--fail-on", "warning");
    expect(r.code).toBe(0);
    expect(r.out).toContain("INFO");
  });

  it("ignores rules by ID, repeated or comma separated", async () => {
    expect(
      (await cli(...removedParam, "--fail-on", "warning", "--ignore", "PARAM_REMOVED")).code,
    ).toBe(0);
    const r = await cli(
      ...removedParam,
      "--ignore",
      "OP_ADDED",
      "--ignore",
      "PARAM_REMOVED,PATH_ADDED",
    );
    expect(r.out).toContain("No API changes detected.");
    expect(r.out).toContain("Summary: 0 breaking, 0 warning, 0 info");
  });
});

describe("usage errors (exit 2)", () => {
  it.each([
    [[], /expected exactly two arguments/],
    [[v1], /expected exactly two arguments/],
    [[v1, v1, v1], /expected exactly two arguments/],
    [[v1, v1, "--format", "xml"], /invalid --format "xml"/],
    [[v1, v1, "--fail-on", "sometimes"], /invalid --fail-on "sometimes"/],
    [[v1, v1, "--ignore", "NOPE,PATH_ADDED"], /unknown rule ID in --ignore: NOPE/],
    [[v1, v1, "--bogus"], /--bogus/],
  ])("%j", async (args, message) => {
    const r = await cli(...args);
    expect(r.code).toBe(2);
    expect(r.out).toBe("");
    expect(r.err).toMatch(message);
    expect(r.err).toContain('Run "specdiff --help"');
  });

  it("reports invalid specs with the file name", async () => {
    const bad = fixture("_loading/invalid.yaml");
    const r = await cli(v1, bad);
    expect(r.code).toBe(2);
    expect(r.out).toBe("");
    expect(r.err.startsWith(`specdiff: ${bad}: `)).toBe(true);
    expect(r.err).toContain("info");
  });

  it("rejects Swagger 2.0 and missing files", async () => {
    const swagger = await cli(v1, fixture("_loading/swagger2.yaml"));
    expect(swagger.code).toBe(2);
    expect(swagger.err).toContain("unsupported specification");
    const missing = await cli(v1, fixture("_loading/nope.yaml"));
    expect(missing.code).toBe(2);
    expect(missing.err).toContain("nope.yaml");
  });

  it("rejects documents with ambiguous path shapes", async () => {
    const dup = fixture("_loading/duplicate-shape.yaml");
    const r = await cli(dup, dup);
    expect(r.code).toBe(2);
    expect(r.err).toContain("same template shape");
  });
});

describe("--help and --version", () => {
  it("prints help", async () => {
    const r = await cli("--help");
    expect(r.code).toBe(0);
    expect(r.out).toContain("Usage:");
    for (const code of ["130", "141"]) expect(r.out).toContain(code);
  });

  it("prints the version", async () => {
    const r = await cli("--version");
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^\d+\.\d+\.\d+\n$/);
  });
});

describe("formats", () => {
  it("hides safe changes unless asked", async () => {
    const hidden = await cli(v1, v2);
    expect(hidden.out).toContain("safe hidden, use --include-safe");
    expect(hidden.out).not.toContain("SAFE ");
    const shown = await cli(v1, v2, "--include-safe");
    expect(shown.out).toContain("SAFE ");
    expect(shown.out).not.toContain("hidden");
  });

  it("emits valid, deterministic JSON", async () => {
    const a = await cli(v1, v2, "--format", "json");
    const b = await cli(v1, v2, "--format", "json");
    expect(a.out).toBe(b.out);
    const json = JSON.parse(a.out) as {
      schemaVersion: number;
      tool: { name: string };
      changes: {
        id: string;
        severity: string;
        operation: string;
        location: object;
        message: string;
      }[];
      summary: Record<string, number>;
    };
    expect(json.schemaVersion).toBe(1);
    expect(json.tool.name).toBe("specdiff");
    expect(json.changes.every((c) => c.severity !== "safe")).toBe(true);
    expect(json.summary.hiddenSafe).toBe(json.summary.safe);
    expect(Object.keys(json.changes[0] ?? {})).toEqual([
      "id",
      "severity",
      "operation",
      "location",
      "message",
    ]);
    const all = JSON.parse(
      (await cli(v1, v2, "--format", "json", "--include-safe")).out,
    ) as typeof json;
    expect(all.summary.hiddenSafe).toBe(0);
    expect(all.changes.length).toBe(all.summary.total);
    for (const change of all.changes) expect(RULE_IDS).toContain(change.id);
  });

  it("escapes table-breaking characters in Markdown", async () => {
    const r = await cli(v1, v2, "--format", "markdown");
    expect(r.out.startsWith("## SpecDiff report")).toBe(true);
    expect(r.out).toContain("| Breaking | ");
    for (const line of r.out.split("\n").filter((l) => l.startsWith("| ") && l.includes("`"))) {
      // Every change row has exactly three unescaped cells.
      expect(line.replace(/\\\|/g, "").split("|").length).toBe(5);
    }
  });

  it("renders an empty report in every format", async () => {
    expect((await cli(v1, v1, "--format", "markdown")).out).toContain("No API changes detected.");
    const json = JSON.parse((await cli(v1, v1, "--format", "json")).out) as { changes: unknown[] };
    expect(json.changes).toEqual([]);
  });
});
