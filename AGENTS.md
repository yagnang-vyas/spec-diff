# AGENTS.md

Guidance for AI coding agents (and humans) working in this repository.

## What this is

SpecDiff is a TypeScript CLI that diffs two OpenAPI 3.x documents and classifies each change as
`breaking`, `warning`, `safe` or `info`. `SPEC.md` is the source of truth for behavior; read its rule
table and Decisions section before changing a rule.

## Commands

| Command             | What it does                                                      |
| ------------------- | ----------------------------------------------------------------- |
| `npm run typecheck` | `tsc --noEmit` (strict)                                           |
| `npm run lint`      | eslint (type-aware) and `prettier --check`                        |
| `npm run build`     | bundle `src/cli.ts` to `dist/cli.js` with tsup                    |
| `npm run test`      | vitest with coverage (thresholds are enforced, do not lower them) |
| `npm run check`     | everything above plus `publint`; must pass before every commit    |

## Layout

```
src/cli.ts            argument parsing, exit codes
src/load.ts           parse + validate + dereference both specs
src/normalize.ts      path shapes, parameter keys, nullability, security
src/model.ts          normalized operations
src/rules.ts          rule registry: id, severity, message template
src/diff/*.ts         one module per concern; schema.ts is direction-aware
src/report/*.ts       text, json, markdown
test/fixtures/<RULE_ID>/{base,head}.yaml + expected.json
```

## Rules of the road

1. Every rule in `src/rules.ts` needs a fixture directory `test/fixtures/<RULE_ID>/` and an entry
   in the `SPEC.md` table. A meta-test enforces both.
2. Add a rule by: registry entry, emitting code, fixture, `SPEC.md` row. Never emit a change whose
   ID is not in the registry.
3. Fix failing checks in code. Never weaken or skip a test, never lower coverage thresholds, and
   never use `@ts-ignore` or `as any` without a justification comment.
4. Output must be deterministic: sorted, no timestamps, no absolute paths added by the tool.
5. Fixtures are original synthetic specs. README sample output must come from real runs.
6. Conventional Commits. Run `npm run check` before committing.
7. Regenerate the bookstore golden file with `UPDATE_GOLDEN=1 npm test` and review the diff by hand.
