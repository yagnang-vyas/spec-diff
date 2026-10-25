import { resolve } from "node:path";
import { run } from "../../src/cli.js";

export interface Result {
  code: number;
  out: string;
  err: string;
}

export async function cli(...argv: string[]): Promise<Result> {
  let out = "";
  let err = "";
  const code = await run(argv, { stdout: (t) => (out += t), stderr: (t) => (err += t) });
  return { code, out, err };
}

export const fixture = (...parts: string[]) =>
  resolve(import.meta.dirname, "../fixtures", ...parts);
export const example = (name: string) => `examples/bookstore/${name}`;
