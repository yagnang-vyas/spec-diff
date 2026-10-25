import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { RULE_IDS } from "../../src/rules.js";

const root = resolve(import.meta.dirname, "../..");
const read = (...parts: string[]) => readFileSync(resolve(root, ...parts), "utf8");
const readme = read("README.md");

describe("README", () => {
  it("embeds the real text report verbatim", () => {
    expect(readme).toContain(`\`\`\`text\n${read("test/golden/bookstore.txt").trimEnd()}\n\`\`\``);
  });

  it("embeds the real Markdown report excerpt verbatim", () => {
    const excerpt = /```markdown\n([\s\S]*?)\n```/.exec(readme)?.[1] ?? "";
    expect(excerpt.length).toBeGreaterThan(100);
    expect(read("test/golden/bookstore.md").startsWith(excerpt)).toBe(true);
  });

  it("embeds the real JSON report excerpt verbatim", () => {
    const excerpt = /```json\n([\s\S]*?)\n {4}\.\.\.\n```/.exec(readme)?.[1] ?? "";
    expect(excerpt.length).toBeGreaterThan(100);
    expect(read("test/golden/bookstore.json").startsWith(excerpt)).toBe(true);
  });

  it("lists every rule", () => {
    expect(RULE_IDS.filter((id) => !new RegExp(`\\| \`${id}\` +\\|`).test(readme))).toEqual([]);
  });

  it("documents every exit code and the unsupported constructs", () => {
    for (const code of ["`0`", "`1`", "`2`", "`130`", "`141`"])
      expect(readme).toMatch(new RegExp(`\\| ${code} +\\|`));
    for (const keyword of ["oneOf", "anyOf", "patternProperties", "dependentSchemas"]) {
      expect(readme).toContain(keyword);
    }
  });
});

describe("project workflow", () => {
  const workflow = parse(read(".github/workflows/ci.yml")) as {
    permissions: Record<string, string>;
    concurrency: { "cancel-in-progress": boolean };
    jobs: { check: { strategy: { matrix: { node: number[] } }; steps: { run?: string }[] } };
  };

  it("runs the checks on Node 22 and 24 with read-only permissions", () => {
    expect(workflow.jobs.check.strategy.matrix.node).toEqual([22, 24]);
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.concurrency["cancel-in-progress"]).toBe(true);
    const commands = workflow.jobs.check.steps.map((s) => s.run);
    expect(commands).toContain("npm ci");
    expect(commands).toContain("npm run check");
  });
});

describe("package", () => {
  const pkg = JSON.parse(read("package.json")) as Record<string, Record<string, string> | string>;

  it("declares the bin, scripts and the single runtime dependency", () => {
    expect(pkg.bin).toEqual({ specdiff: "./dist/cli.js" });
    for (const script of ["build", "typecheck", "lint", "test", "check"]) {
      expect(Object.keys(pkg.scripts as object)).toContain(script);
    }
    expect(Object.keys(pkg.dependencies as object)).toEqual(["@apidevtools/swagger-parser"]);
    expect(pkg.type).toBe("module");
  });
});
