import type { JsonObject } from "../src/model.js";

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
