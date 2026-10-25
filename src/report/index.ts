import type { Change } from "../diff/context.js";
import type { SpecInfo } from "../model.js";
import type { Severity } from "../rules.js";

export type Format = "text" | "json" | "markdown";
export const FORMATS: readonly Format[] = ["text", "json", "markdown"];

export interface ToolInfo {
  name: string;
  version: string;
}

export interface Report {
  tool: ToolInfo;
  base: SpecInfo;
  head: SpecInfo;
  /** Every change after `--ignore` filtering, including safe ones, in deterministic order. */
  changes: Change[];
  includeSafe: boolean;
}

export type Summary = Record<Severity, number> & { total: number };

export function summarize(changes: readonly Change[]): Summary {
  const summary: Summary = { breaking: 0, warning: 0, safe: 0, info: 0, total: changes.length };
  for (const change of changes) summary[change.severity] += 1;
  return summary;
}

/** The changes a report lists: safe ones only on request. */
export function visibleChanges(report: Report): Change[] {
  return report.includeSafe ? report.changes : report.changes.filter((c) => c.severity !== "safe");
}

/** Consecutive changes grouped by operation, preserving order. */
export function groupByOperation(changes: readonly Change[]): [string, Change[]][] {
  const groups: [string, Change[]][] = [];
  for (const change of changes) {
    const last = groups[groups.length - 1];
    if (last && last[0] === change.operation) last[1].push(change);
    else groups.push([change.operation, [change]]);
  }
  return groups;
}

export function describeSpec(info: SpecInfo): string {
  const name = [info.title, info.version].filter((part) => part !== "").join(" ");
  return `${info.file} (${name ? `${name}, ` : ""}OpenAPI ${info.openapi})`;
}
