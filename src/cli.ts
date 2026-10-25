import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pkg from "../package.json" with { type: "json" };

export interface Io {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

export function run(argv: string[], io: Io): number {
  if (argv.includes("--version")) {
    io.stdout(`${pkg.version}\n`);
    return 0;
  }
  io.stderr("specdiff: not implemented yet\n");
  return 2;
}

/* v8 ignore start -- process entry detection, exercised by the CLI integration tests */
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
  process.exitCode = run(process.argv.slice(2), {
    stdout: (t) => process.stdout.write(t),
    stderr: (t) => process.stderr.write(t),
  });
}
/* v8 ignore stop */
