import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { compareFiles } from "../../src/diff/index.js";
import { RULE_IDS, RULES, isRuleId, formatMessage } from "../../src/rules.js";

const fixturesDir = resolve(import.meta.dirname, "../fixtures");
const specDoc = readFileSync(resolve(import.meta.dirname, "../../SPEC.md"), "utf8");

const fixtureDirs = readdirSync(fixturesDir)
  .filter((name) => existsSync(resolve(fixturesDir, name, "expected.json")))
  .sort();

describe("rule fixtures", () => {
  it.each(fixtureDirs)("%s", async (name) => {
    const dir = resolve(fixturesDir, name);
    const { changes } = await compareFiles(resolve(dir, "base.yaml"), resolve(dir, "head.yaml"));
    const expected: unknown = JSON.parse(readFileSync(resolve(dir, "expected.json"), "utf8"));
    expect(changes).toEqual(expected);
  });
});

describe("rule registry", () => {
  it("has a fixture that exercises every rule", () => {
    const missing: string[] = [];
    for (const id of RULE_IDS) {
      const expectedFile = resolve(fixturesDir, id, "expected.json");
      if (!existsSync(expectedFile)) {
        missing.push(id);
        continue;
      }
      const expected = JSON.parse(readFileSync(expectedFile, "utf8")) as { id: string }[];
      if (!expected.some((c) => c.id === id)) missing.push(`${id} (fixture never reports it)`);
    }
    expect(missing).toEqual([]);
  });

  it("only has fixtures named after registered rules", () => {
    const stray = fixtureDirs
      .filter((name) => !name.startsWith("_"))
      .filter((name) => !isRuleId(name.split("--")[0] ?? ""));
    expect(stray).toEqual([]);
  });

  it("documents every rule in SPEC.md", () => {
    const undocumented = RULE_IDS.filter((id) => !specDoc.includes(`| \`${id}\``));
    expect(undocumented).toEqual([]);
  });

  it("only lists registered rules in SPEC.md", () => {
    const listed = [...specDoc.matchAll(/^\| `([A-Z_]+)`/gm)].map((m) => m[1] ?? "");
    expect(listed.filter((id) => !isRuleId(id))).toEqual([]);
  });

  it("formats messages and rejects missing parameters", () => {
    expect(formatMessage("PATH_REMOVED", { path: "/a" })).toBe("path /a removed");
    expect(() => formatMessage("PATH_REMOVED")).toThrow(/missing message parameter "path"/);
    expect(isRuleId("NOPE")).toBe(false);
    expect(Object.values(RULES).every((r) => r.summary.length > 0)).toBe(true);
  });
});
