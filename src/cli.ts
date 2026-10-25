import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import pkg from "../package.json" with { type: "json" };
import { compareFiles } from "./diff/index.js";
import { SpecdiffError } from "./errors.js";
import { renderJson } from "./report/json.js";
import { renderMarkdown } from "./report/markdown.js";
import { FORMATS, type Format, type Report } from "./report/index.js";
import { renderText } from "./report/text.js";
import { isRuleId, type Severity } from "./rules.js";

export interface Io {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

export type FailOn = "breaking" | "warning" | "never";
const FAIL_ON: readonly FailOn[] = ["breaking", "warning", "never"];

export const EXIT = { ok: 0, changes: 1, usage: 2, interrupted: 130, pipeClosed: 141 } as const;

const HELP = `specdiff ${pkg.version}
Compare two OpenAPI 3.x documents and classify every change as breaking, warning or safe.

Usage:
  specdiff <base> <head> [options]

Options:
  --format <text|json|markdown>   Output format (default: text)
  --fail-on <breaking|warning|never>
                                  Exit 1 when a change at or above this severity exists
                                  (default: breaking)
  --include-safe                  List safe changes (hidden by default)
  --ignore <RULE_ID,...>          Ignore rules by ID (repeatable)
  --version                       Print the version
  --help                          Print this help

Exit codes:
  0    nothing at or above the --fail-on threshold
  1    changes at or above the threshold
  2    usage or input error (including invalid specs)
  130  interrupted
  141  output pipe closed early
`;

class UsageError extends Error {}

interface Options {
  base: string;
  head: string;
  format: Format;
  failOn: FailOn;
  includeSafe: boolean;
  ignore: Set<string>;
}

function parseOptions(argv: string[]): Options | "help" | "version" {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        format: { type: "string", default: "text" },
        "fail-on": { type: "string", default: "breaking" },
        "include-safe": { type: "boolean", default: false },
        ignore: { type: "string", multiple: true },
        version: { type: "boolean", default: false },
        help: { type: "boolean", default: false },
      },
    });
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
  const { values, positionals } = parsed;
  if (values.help) return "help";
  if (values.version) return "version";

  const format = values.format;
  if (!FORMATS.includes(format as Format)) {
    throw new UsageError(`invalid --format "${format}" (expected ${FORMATS.join(", ")})`);
  }
  const failOn = values["fail-on"];
  if (!FAIL_ON.includes(failOn as FailOn)) {
    throw new UsageError(`invalid --fail-on "${failOn}" (expected ${FAIL_ON.join(", ")})`);
  }
  const ignore = new Set(
    (values.ignore ?? [])
      .flatMap((entry) => entry.split(","))
      .map((id) => id.trim())
      .filter((id) => id !== ""),
  );
  const unknown = [...ignore].filter((id) => !isRuleId(id));
  if (unknown.length > 0) {
    throw new UsageError(`unknown rule ID in --ignore: ${unknown.join(", ")}`);
  }
  const [base, head, ...extra] = positionals;
  if (base === undefined || head === undefined || extra.length > 0) {
    throw new UsageError("expected exactly two arguments: <base> <head>");
  }
  return {
    base,
    head,
    format: format as Format,
    failOn: failOn as FailOn,
    includeSafe: values["include-safe"],
    ignore,
  };
}

const RENDERERS: Record<Format, (report: Report) => string> = {
  text: renderText,
  json: renderJson,
  markdown: renderMarkdown,
};

/** Severities that trip each `--fail-on` threshold. */
const FAILING: Record<FailOn, readonly Severity[]> = {
  breaking: ["breaking"],
  warning: ["breaking", "warning"],
  never: [],
};

export async function run(argv: string[], io: Io): Promise<number> {
  try {
    const options = parseOptions(argv);
    if (options === "help") {
      io.stdout(HELP);
      return EXIT.ok;
    }
    if (options === "version") {
      io.stdout(`${pkg.version}\n`);
      return EXIT.ok;
    }

    const comparison = await compareFiles(options.base, options.head);
    const changes = comparison.changes.filter((c) => !options.ignore.has(c.id));
    const report: Report = {
      tool: { name: "specdiff", version: pkg.version },
      base: comparison.base,
      head: comparison.head,
      changes,
      includeSafe: options.includeSafe,
    };
    io.stdout(RENDERERS[options.format](report));
    const failing = FAILING[options.failOn];
    return changes.some((c) => failing.includes(c.severity)) ? EXIT.changes : EXIT.ok;
  } catch (error) {
    if (error instanceof UsageError) {
      io.stderr(`specdiff: ${error.message}\nRun "specdiff --help" for usage.\n`);
      return EXIT.usage;
    }
    if (error instanceof SpecdiffError) {
      io.stderr(`specdiff: ${error.message}\n`);
      return EXIT.usage;
    }
    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
    io.stderr(`specdiff: unexpected error: ${detail}\n`);
    return EXIT.usage;
  }
}

/* v8 ignore start -- process entry point, exercised by the CLI integration tests */
function isMain(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  process.on("SIGINT", () => process.exit(EXIT.interrupted));
  // A closed pipe (for example `specdiff a b | head -1`) is not an error worth a stack trace.
  process.stdout.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EPIPE") process.exit(EXIT.pipeClosed);
    throw error;
  });
  process.exitCode = await run(process.argv.slice(2), {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  });
}
/* v8 ignore stop */
