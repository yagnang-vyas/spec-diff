import { loadSpec } from "../load.js";
import { HTTP_METHODS, type NormalizedSpec, type SpecInfo } from "../model.js";
import { normalizeSpec } from "../normalize.js";
import type { Change } from "./context.js";
import { diffPaths } from "./paths.js";

const METHOD_RANK = new Map<string, number>(HTTP_METHODS.map((m, i) => [m.toUpperCase(), i]));

function splitOperation(operation: string): { path: string; rank: number } {
  const match = /^([A-Z]+) (\/.*)$/.exec(operation);
  if (!match) return { path: operation, rank: -1 };
  return { path: match[2] ?? operation, rank: METHOD_RANK.get(match[1] ?? "") ?? 99 };
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Deterministic order: path, method, location, rule ID, message. */
export function sortChanges(changes: Change[]): Change[] {
  const key = (c: Change) => c.location.head ?? c.location.base ?? "";
  return [...changes].sort((a, b) => {
    const oa = splitOperation(a.operation);
    const ob = splitOperation(b.operation);
    return (
      compare(oa.path, ob.path) ||
      oa.rank - ob.rank ||
      compare(key(a), key(b)) ||
      compare(a.id, b.id) ||
      compare(a.message, b.message) ||
      compare(a.location.base ?? "", b.location.base ?? "")
    );
  });
}

/** Compare two normalized specs and return every change in deterministic order. */
export function diffSpecs(base: NormalizedSpec, head: NormalizedSpec): Change[] {
  const changes: Change[] = [];
  diffPaths(base, head, changes);
  return sortChanges(changes);
}

export interface Comparison {
  base: SpecInfo;
  head: SpecInfo;
  changes: Change[];
}

/** Load, normalize and compare two spec files. */
export async function compareFiles(baseFile: string, headFile: string): Promise<Comparison> {
  const [base, head] = await Promise.all([loadSpec(baseFile), loadSpec(headFile)]);
  return {
    base: base.info,
    head: head.info,
    changes: diffSpecs(normalizeSpec(base), normalizeSpec(head)),
  };
}
