import { describe, expect, it } from "vitest";
import { run } from "../../src/cli.js";

function capture(argv: string[]) {
  let out = "";
  let err = "";
  const code = run(argv, { stdout: (t) => (out += t), stderr: (t) => (err += t) });
  return { code, out, err };
}

describe("cli scaffold", () => {
  it("prints the version", () => {
    const r = capture(["--version"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^\d+\.\d+\.\d+\n$/);
  });

  it("rejects missing arguments until the CLI lands", () => {
    expect(capture([]).code).toBe(2);
  });
});
