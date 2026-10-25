import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = resolve(import.meta.dirname, "../..");
const readme = readFileSync(resolve(root, "README.md"), "utf8");
const bin = resolve(root, "dist/cli.js");

interface Step {
  name?: string;
  run?: string;
  uses?: string;
  with?: Record<string, unknown>;
}
interface Workflow {
  permissions: Record<string, string>;
  concurrency: { "cancel-in-progress": boolean };
  jobs: Record<string, { env: Record<string, string>; steps: Step[] }>;
}

function recipe(): Workflow {
  const match = /```yaml\n([\s\S]*?)\n```/.exec(readme);
  if (!match?.[1]) throw new Error("README has no yaml recipe");
  return parse(match[1]) as Workflow;
}

const step = (workflow: Workflow, name: string): Step => {
  const found = workflow.jobs.specdiff?.steps.find((s) => s.name === name);
  if (!found?.run) throw new Error(`recipe has no step "${name}"`);
  return found;
};

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });
}

describe("README CI recipe", () => {
  const workflow = recipe();

  it("is a read-only job with full history and cancelling concurrency", () => {
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.concurrency["cancel-in-progress"]).toBe(true);
    const checkout = workflow.jobs.specdiff?.steps.find((s) =>
      s.uses?.startsWith("actions/checkout"),
    );
    expect(checkout?.with?.["fetch-depth"]).toBe(0);
    expect(step(workflow, "Extract the base branch spec").run).toBe(
      "git show origin/${{ github.base_ref }}:openapi.yaml > base.yaml",
    );
    expect(step(workflow, "Compare").run).toContain('>> "$GITHUB_STEP_SUMMARY"');
  });

  describe("run against two commits of the bookstore example", () => {
    let dir: string;
    let work: string;

    beforeAll(() => {
      if (!existsSync(bin)) execFileSync("npx", ["tsup"], { cwd: root, stdio: "ignore" });
      dir = mkdtempSync(join(tmpdir(), "specdiff-ci-"));
      const origin = join(dir, "origin.git");
      git(dir, "init", "--bare", "-b", "main", origin);
      const seed = join(dir, "seed");
      git(dir, "clone", origin, seed);
      cpSync(resolve(root, "examples/bookstore/v1.yaml"), join(seed, "openapi.yaml"));
      git(seed, "add", ".");
      git(seed, "commit", "-m", "v1");
      git(seed, "push", "origin", "HEAD:main");
      work = join(dir, "work");
      git(dir, "clone", origin, work);
      git(work, "checkout", "-b", "feature");
    });

    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    function runStep(name: string, summary: string): { status: number; stdout: string } {
      const script = step(workflow, name).run?.replaceAll("${{ github.base_ref }}", "main") ?? "";
      try {
        const stdout = execFileSync("bash", ["-e", "-c", script], {
          cwd: work,
          encoding: "utf8",
          env: { ...process.env, SPECDIFF: bin, GITHUB_STEP_SUMMARY: summary },
        });
        return { status: 0, stdout };
      } catch (error) {
        const e = error as { status: number; stdout: string };
        return { status: e.status, stdout: e.stdout };
      }
    }

    it("passes while the pull request spec equals the base spec", () => {
      expect(runStep("Extract the base branch spec", "/dev/null").status).toBe(0);
      expect(readFileSync(join(work, "base.yaml"), "utf8")).toBe(
        readFileSync(resolve(root, "examples/bookstore/v1.yaml"), "utf8"),
      );
      const summary = join(dir, "summary-same.md");
      writeFileSync(summary, "");
      const r = runStep("Compare", summary);
      expect(r.status).toBe(0);
      expect(readFileSync(summary, "utf8")).toContain("No API changes detected.");
    });

    it("fails and writes a Markdown summary once the breaking head commit lands", () => {
      cpSync(resolve(root, "examples/bookstore/v2.yaml"), join(work, "openapi.yaml"));
      git(work, "commit", "-am", "v2");
      expect(runStep("Extract the base branch spec", "/dev/null").status).toBe(0);
      const summary = join(dir, "summary-breaking.md");
      writeFileSync(summary, "");
      const r = runStep("Compare", summary);
      expect(r.status).toBe(1);
      expect(r.stdout).toContain("Summary: 24 breaking, 16 warning, 7 info");
      const markdown = readFileSync(summary, "utf8");
      expect(markdown).toContain("## SpecDiff report");
      expect(markdown).toContain("| Breaking | 24 |");
      expect(markdown).toContain("| Safe | 15 |");
    });
  });
});
