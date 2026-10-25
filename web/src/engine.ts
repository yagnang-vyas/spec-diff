// Browser adapter for the SpecDiff engine.
//
// The comparison itself is the unmodified core: normalizeSpec() and diffSpecs() from ../../src, plus
// the core report renderers. Only loading differs. The CLI reads files with SwaggerParser; here the
// text comes from an editor, is parsed with `yaml` (JSON is accepted too), and goes through the same
// SwaggerParser.validate() call on the in-memory object. External $refs cannot be resolved in a
// browser, so only references inside the document work.
import "./polyfill";
import SwaggerParser from "@apidevtools/swagger-parser";
import { parse } from "yaml";
import pkg from "../../package.json";
import { diffSpecs } from "../../src/diff/index";
import type { Change } from "../../src/diff/context";
import type { JsonObject, LoadedSpec } from "../../src/model";
import { normalizeSpec } from "../../src/normalize";
import { renderJson } from "../../src/report/json";
import { renderMarkdown } from "../../src/report/markdown";
import { summarize, type Report, type Summary } from "../../src/report/index";
import { renderText } from "../../src/report/text";
import { isRuleId, type Severity } from "../../src/rules";

export const MAX_INPUT_BYTES = 1_000_000;

export type Side = "before" | "after";
export const SIDE_LABEL: Record<Side, string> = { before: "Before", after: "After" };

export interface InputProblem {
  side: Side;
  message: string;
}

/** One or more inputs could not be used. Nothing was compared. */
export class InputErrors extends Error {
  constructor(readonly problems: InputProblem[]) {
    super(problems.map((p) => `${SIDE_LABEL[p.side]}: ${p.message}`).join("\n"));
  }
}

/** Mirrors the version check in src/load.ts. */
const SUPPORTED = /^3\.[01](\.\d+)?(-.+)?$/;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function loadSpecText(text: string, label: Side): Promise<LoadedSpec> {
  if (text.trim() === "") throw new Error("the specification is empty");
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > MAX_INPUT_BYTES) {
    throw new Error(
      `the specification is ${(bytes / 1_000_000).toFixed(1)} MB; the Playground accepts up to ${MAX_INPUT_BYTES / 1_000_000} MB. Use the CLI for larger files`,
    );
  }
  let parsed: unknown;
  try {
    parsed = parse(text, { maxAliasCount: 100 });
  } catch (error) {
    throw new Error(`not valid YAML or JSON: ${describe(error).split("\n")[0]}`);
  }
  if (!isObject(parsed)) {
    throw new Error("expected an OpenAPI document (a YAML or JSON mapping at the top level)");
  }
  let document: unknown;
  try {
    document = await SwaggerParser.validate(parsed as never, {
      resolve: { external: true, http: false, file: false },
    });
  } catch (error) {
    throw new Error(describe(error));
  }
  const root: JsonObject = isObject(document) ? document : {};
  const openapi = root.openapi;
  if (typeof openapi !== "string" || !SUPPORTED.test(openapi)) {
    const found =
      typeof openapi === "string" ? `OpenAPI ${openapi}` : `Swagger ${String(root.swagger)}`;
    throw new Error(
      `unsupported specification (found ${found}); SpecDiff supports OpenAPI 3.0.x and 3.1.x`,
    );
  }
  const info = isObject(root.info) ? root.info : {};
  return {
    info: { file: label, openapi, title: String(info.title), version: String(info.version) },
    document: root,
  };
}

export interface Comparison {
  base: LoadedSpec;
  head: LoadedSpec;
  /** Every change from the core engine, before any ignore filtering. */
  changes: Change[];
}

export async function compareTexts(before: string, after: string): Promise<Comparison> {
  const [base, head] = await Promise.allSettled([
    loadSpecText(before, "before"),
    loadSpecText(after, "after"),
  ]);
  const problems: InputProblem[] = [];
  if (base.status === "rejected") problems.push({ side: "before", message: describe(base.reason) });
  if (head.status === "rejected") problems.push({ side: "after", message: describe(head.reason) });
  if (base.status === "rejected" || head.status === "rejected") throw new InputErrors(problems);
  return {
    base: base.value,
    head: head.value,
    changes: diffSpecs(normalizeSpec(base.value), normalizeSpec(head.value)),
  };
}

export type FailOn = "breaking" | "warning" | "never";
export const FAIL_ON: readonly FailOn[] = ["breaking", "warning", "never"];
const FAILING: Record<FailOn, readonly Severity[]> = {
  breaking: ["breaking"],
  warning: ["breaking", "warning"],
  never: [],
};

export interface ViewOptions {
  includeSafe: boolean;
  failOn: FailOn;
  /** Comma or whitespace separated rule IDs, like `--ignore`. */
  ignore: string;
}

/** Parse the ignore field like the CLI's `--ignore`; unknown IDs are an error. */
export function parseIgnore(text: string): Set<string> {
  const ids = new Set(text.split(/[\s,]+/).filter((id) => id !== ""));
  const unknown = [...ids].filter((id) => !isRuleId(id));
  if (unknown.length > 0) throw new Error(`unknown rule ID in ignore list: ${unknown.join(", ")}`);
  return ids;
}

export interface View {
  report: Report;
  /** Changes after ignore filtering (including safe ones). */
  changes: Change[];
  summary: Summary;
  /** What the CLI would exit with for these options: 0 or 1. */
  exitCode: 0 | 1;
  text: string;
  markdown: string;
  json: string;
}

export function buildView(comparison: Comparison, options: ViewOptions): View {
  const ignore = parseIgnore(options.ignore);
  const changes = comparison.changes.filter((c) => !ignore.has(c.id));
  const report: Report = {
    tool: { name: "specdiff", version: pkg.version },
    base: comparison.base.info,
    head: comparison.head.info,
    changes,
    includeSafe: options.includeSafe,
  };
  const failing = FAILING[options.failOn];
  return {
    report,
    changes,
    summary: summarize(changes),
    exitCode: changes.some((c) => failing.includes(c.severity)) ? 1 : 0,
    text: renderText(report),
    markdown: renderMarkdown(report),
    json: renderJson(report),
  };
}
