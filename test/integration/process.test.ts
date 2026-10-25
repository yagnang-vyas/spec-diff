import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, openSync, closeSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { example } from "./helpers.js";

const root = resolve(import.meta.dirname, "../..");
const bin = resolve(root, "dist/cli.js");

beforeAll(() => {
  if (!existsSync(bin)) execFileSync("npx", ["tsup"], { cwd: root, stdio: "ignore" });
});

interface Outcome {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

function collect(child: ChildProcess): Promise<Outcome> {
  return new Promise((resolveOutcome) => {
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr?.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("close", (code, signal) => resolveOutcome({ code, signal, stdout, stderr }));
  });
}

const node = (...args: string[]) => spawn(process.execPath, [bin, ...args], { cwd: root });

describe("built binary", () => {
  it("prints the version through the entry point", async () => {
    const r = await collect(node("--version"));
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^\d+\.\d+\.\d+\n$/);
  });

  it("propagates exit code 1 and writes the report to stdout", async () => {
    const r = await collect(node(example("v1.yaml"), example("v2.yaml")));
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("Summary:");
    expect(r.stderr).toBe("");
  });

  it("exits 2 with a message on stderr for bad input", async () => {
    const r = await collect(node(example("v1.yaml"), "missing.yaml"));
    expect(r.code).toBe(2);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("missing.yaml");
  });

  it("exits 141 quietly when the output pipe is closed early", async () => {
    const child = node(example("v1.yaml"), example("v2.yaml"));
    const outcome = collect(child);
    child.stdout?.destroy();
    const r = await outcome;
    expect(r.code).toBe(141);
    expect(r.stderr).toBe("");
  });

  it("exits 130 on SIGINT", async () => {
    const dir = mkdtempSync(join(tmpdir(), "specdiff-"));
    const fifo = join(dir, "base.yaml");
    try {
      execFileSync("mkfifo", [fifo]);
      const child = node(fifo, example("v2.yaml"));
      const outcome = collect(child);
      // Opening the FIFO for writing blocks until the child opens it for reading, which only
      // happens after the process (and its signal handler) is up.
      const fd = openSync(fifo, "w");
      child.kill("SIGINT");
      // The child is still blocked reading the FIFO inside libuv's thread pool, and a process
      // cannot finish exiting until that thread returns. Give the signal handler time to run,
      // then close the FIFO so the exit can complete.
      await new Promise((done) => setTimeout(done, 300));
      closeSync(fd);
      const r = await outcome;
      expect(r.code).toBe(130);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
