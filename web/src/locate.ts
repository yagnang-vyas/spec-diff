import type { JsonObject } from "../../src/model";

export type Located = { found: true; value: unknown } | { found: false };

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Resolve a core location such as `paths./books/{id}.get.parameters.query.status` against a
 * dereferenced document. Keys are joined with dots, so a key may itself contain dots; try the
 * shortest key first and backtrack. Parameters are stored in an array and addressed as
 * `parameters.<in>.<name>`.
 */
export function locate(root: unknown, location: string | null): Located {
  if (location === null) return { found: false };
  const parts = location.split(".");

  const walk = (node: unknown, i: number): Located => {
    if (i === parts.length) return { found: true, value: node };
    if (Array.isArray(node)) {
      const [where, name] = [parts[i], parts[i + 1]];
      const hit = node.find((p) => isObject(p) && p.in === where && p.name === name);
      return hit === undefined ? { found: false } : walk(hit, i + 2);
    }
    if (!isObject(node)) return { found: false };
    for (let j = i + 1; j <= parts.length; j++) {
      const key = parts.slice(i, j).join(".");
      if (Object.prototype.hasOwnProperty.call(node, key)) {
        const result = walk(node[key], j);
        if (result.found) return result;
      }
    }
    return { found: false };
  };
  return walk(root, 0);
}

/** JSON for display: depth-limited and cycle-safe (dereferenced documents can be recursive). */
export function excerpt(value: unknown, maxDepth = 6, maxChars = 4000): string {
  const seen = new WeakSet<object>();
  const prune = (node: unknown, depth: number): unknown => {
    if (typeof node !== "object" || node === null) return node;
    if (seen.has(node)) return "[circular]";
    if (depth >= maxDepth) return Array.isArray(node) ? "[…]" : "{…}";
    seen.add(node);
    const out = Array.isArray(node)
      ? node.map((v) => prune(v, depth + 1))
      : Object.fromEntries(Object.entries(node).map(([k, v]) => [k, prune(v, depth + 1)]));
    seen.delete(node);
    return out;
  };
  const text = JSON.stringify(prune(value, 0), null, 2) ?? String(value);
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n… (truncated)` : text;
}
