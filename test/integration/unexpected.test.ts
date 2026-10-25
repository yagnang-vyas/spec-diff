import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/diff/index.js", () => ({
  compareFiles: vi.fn(),
}));

import { compareFiles } from "../../src/diff/index.js";
import { cli } from "./helpers.js";

describe("unexpected failures", () => {
  it("reports internal errors on stderr with exit code 2", async () => {
    vi.mocked(compareFiles).mockRejectedValueOnce(new Error("boom"));
    const r = await cli("a.yaml", "b.yaml");
    expect(r.code).toBe(2);
    expect(r.out).toBe("");
    expect(r.err).toContain("unexpected error");
    expect(r.err).toContain("boom");
  });

  it("copes with non-Error rejections", async () => {
    vi.mocked(compareFiles).mockRejectedValueOnce("just a string");
    const r = await cli("a.yaml", "b.yaml");
    expect(r.code).toBe(2);
    expect(r.err).toContain("just a string");
  });
});
