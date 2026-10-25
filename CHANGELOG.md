# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.0] - Unreleased

First version.

### Added

- Loading and validation of OpenAPI 3.0.x and 3.1.x documents, including relative file `$ref`s and
  recursive schemas. `http(s)` references are not fetched.
- Normalization: path templates matched by shape, parameters keyed by `(in, name)` (path
  parameters by position, header names case-insensitive), path-level parameters merged into
  operations, and 3.0 `nullable` / 3.1 `type` arrays treated as the same thing.
- Direction-aware schema comparison with cycle detection: requests break when stricter, responses
  break when looser or lossy.
- Rule registry with 49 rules covering paths, operations, parameters, request bodies, responses,
  schemas, security requirements and unsupported constructs. See `SPEC.md`.
- `specdiff <base> <head>` CLI with `--format text|json|markdown`, `--fail-on`, `--include-safe`,
  `--ignore`, `--version` and `--help`, and exit codes `0`, `1`, `2`, `130` and `141`.
- Deterministic text, JSON (`schemaVersion: 1`) and Markdown reports.
- One fixture per rule, normalization, recursion and cross-file tests, CLI and process tests, and a
  golden end-to-end test on a 33-operation example (`examples/bookstore`).
- GitHub Actions workflow for the project and a documented recipe for gating a pull request's
  OpenAPI file against its base branch.
