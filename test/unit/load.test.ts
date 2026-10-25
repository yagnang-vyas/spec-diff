import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SpecdiffError } from "../../src/errors.js";
import { loadSpec } from "../../src/load.js";
import { dig } from "../helpers.js";

const dir = (name: string) => resolve(import.meta.dirname, "../fixtures/_loading", name);

describe("loadSpec", () => {
  it("loads OpenAPI 3.0 and 3.1 documents", async () => {
    const v30 = await loadSpec(dir("valid-30.yaml"));
    const v31 = await loadSpec(dir("valid-31.yaml"));
    expect(v30.info).toMatchObject({ openapi: "3.0.3", title: "Library", version: "1.2.0" });
    expect(v31.info).toMatchObject({ openapi: "3.1.0", version: "2.0.0" });
  });

  it("prefixes validator errors with the file name", async () => {
    const file = dir("invalid.yaml");
    const error = await loadSpec(file).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SpecdiffError);
    expect((error as Error).message.startsWith(`${file}: `)).toBe(true);
    expect((error as Error).message).toMatch(/info/i);
  });

  it("rejects Swagger 2.0 with a clear message", async () => {
    await expect(loadSpec(dir("swagger2.yaml"))).rejects.toThrow(
      /unsupported specification \(found Swagger 2\.0\)/,
    );
  });

  it("rejects files that are not parseable", async () => {
    await expect(loadSpec(dir("not-yaml.txt"))).rejects.toBeInstanceOf(SpecdiffError);
  });

  it("rejects missing files", async () => {
    await expect(loadSpec(dir("missing.yaml"))).rejects.toThrow(/missing\.yaml/);
  });

  it("does not fetch http references", async () => {
    await expect(loadSpec(dir("http-ref.yaml"))).rejects.toBeInstanceOf(SpecdiffError);
  });

  it("resolves relative $refs across files", async () => {
    const spec = await loadSpec(dir("cross-file.yaml"));
    const pet = dig(
      spec.document,
      "paths",
      "/pets",
      "get",
      "responses",
      "200",
      "content",
      "application/json",
      "schema",
    );
    expect(dig(pet, "properties", "name")).toEqual({ type: "string" });
    expect(dig(pet, "properties", "owner", "properties", "email").format).toBe("email");
  });

  it("keeps recursive schemas as a cyclic object graph", async () => {
    const spec = await loadSpec(dir("recursive.yaml"));
    const node = dig(
      spec.document,
      "paths",
      "/tree",
      "get",
      "responses",
      "200",
      "content",
      "application/json",
      "schema",
    );
    expect(dig(node, "properties", "children", "items")).toBe(node);
  });
});
