import { diffSpecs } from "../src/diff/index.js";
import type { JsonObject, LoadedSpec } from "../src/model.js";
import { normalizeSpec } from "../src/normalize.js";

/** Walk nested objects by key; throws when the path does not lead to an object. */
export function dig(root: unknown, ...keys: string[]): JsonObject {
  let current: unknown = root;
  for (const key of keys) {
    if (typeof current !== "object" || current === null) {
      throw new Error(`cannot read "${key}" of a non-object`);
    }
    current = (current as JsonObject)[key];
  }
  if (typeof current !== "object" || current === null) {
    throw new Error(`"${keys.join(".")}" is not an object`);
  }
  return current as JsonObject;
}

function inline(document: JsonObject): LoadedSpec {
  return { info: { file: "inline", openapi: "3.1.0", title: "t", version: "1" }, document };
}

/** Diff two in-memory documents that contain no `$ref`s. */
export function diffDocs(base: JsonObject, head: JsonObject) {
  return diffSpecs(normalizeSpec(inline(base)), normalizeSpec(inline(head)));
}

/** A document with one GET whose 200 JSON response has the given schema. */
export function responseDoc(schema: unknown): JsonObject {
  return {
    paths: {
      "/a": {
        get: {
          responses: { "200": { description: "ok", content: { "application/json": { schema } } } },
        },
      },
    },
  };
}

/** A document with one POST whose JSON request body has the given schema. */
export function requestDoc(schema: unknown): JsonObject {
  return {
    paths: {
      "/a": {
        post: {
          requestBody: { content: { "application/json": { schema } } },
          responses: { "200": { description: "ok" } },
        },
      },
    },
  };
}

export const summarize = (changes: { severity: string; id: string }[]) =>
  changes.map((c) => `${c.severity} ${c.id}`);
