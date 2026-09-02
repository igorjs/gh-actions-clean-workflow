# Contributing to gh-actions-clean-workflow

This project follows the standard igorjs contribution rules. Start here:

- **[.github/CONTRIBUTING-RULES.md](.github/CONTRIBUTING-RULES.md)**: DCO, CLA, commit conventions, PR process, and the code style baseline (SPDX headers, dependency policy, commit signing). These rules are shared across all igorjs repos.
- **[README](README.md)**: project description, inputs/outputs, and usage examples.
- **[SECURITY.md](SECURITY.md)**: vulnerability disclosure process.

## Prerequisites and Setup

- Node.js >= 26.0.0 (development; the published action runs on GitHub's `node24` runtime)
- pnpm >= 11.5.2 (enforced via `packageManager`; use [Corepack](https://nodejs.org/api/corepack.html))

```bash
corepack enable
pnpm install
```

## Code Style

No project-specific code style rules beyond the baseline. See [.github/CONTRIBUTING-RULES.md](.github/CONTRIBUTING-RULES.md#code-style-baseline) for SPDX header, dependency policy, and commit signing requirements.

This project uses Node's native subpath imports for local imports that cross a folder boundary: `#src/*` resolves to `src/*.ts`, `#test/*` resolves to `test/*.ts` (the alias only covers `.ts` files today; see the `imports` field in `package.json`). An import between files in the same folder stays a relative import (e.g. `./logger`); only cross-folder imports use the `#src/*`/`#test/*` alias.

Logic is split between `src/core/` and `src/lib/` by purity. `src/core/` holds pure functions only: no I/O, no mutation of anything outside their own return value, directly unit-testable with plain inputs/outputs and no mocks needed. `src/lib/` holds the impure shells: factories, network calls (via `@actions/github`), logging, env/input reads (via `@actions/core`), and orchestration, each delegating its business logic to the matching `src/core/` module. `circuit-breaker.ts`, `retry.ts`, `params.ts`, `api.ts`, and `logger.ts` each have both a `src/core/*.ts` counterpart and a `src/lib/*.ts` counterpart; for example, `src/core/circuit-breaker.ts`'s `applySuccess`/`applyFailure`/`checkExecutability` pure state transitions versus `src/lib/circuit-breaker.ts`'s stateful `createCircuitBreaker` shell that wraps them.

## Tests

### Common commands

```bash
pnpm run check         # Biome lint + format check
pnpm run check:fix     # Auto-fix lint + format
pnpm run test          # Vitest run
pnpm run test:watch    # Vitest watch
pnpm run test:coverage # Vitest run with v8 coverage + thresholds
pnpm run build         # esbuild bundle to dist/index.js
pnpm run all           # check + test + build
```

Tests run on Vitest with v8 coverage. Coverage thresholds are enforced by `vitest.config.ts` (lines/functions/branches/statements >= 95%); the CI build fails if coverage drops below them. Live coverage is published as a Shields endpoint badge (see the Coverage badge in [README.md](README.md)) from the [`Coverage Badge`](https://github.com/igorjs/gh-actions-clean-workflow/actions/workflows/coverage-badge.yml) workflow. The unit suite also covers large-N and boundary stress scenarios (pagination, batching, circuit-breaker thresholds) and sustained-failure/retry sequences; these run inside the same coverage-gated `pnpm run test`, no separate command needed.

A second, non-coverage-gated suite lives under `test/e2e/`: a local mock GitHub API server (`test/e2e/fixtures/`) plus a subprocess smoke test (`test/e2e/smoke/`) that spawns the real compiled `dist/index.js` against it, proving the bundled artifact's pagination, retry, and circuit-breaker logic work post-build, not just the source. Run it with `pnpm run test:e2e`, which uses a separate config, `vitest.e2e.config.ts`, kept outside the coverage gate on purpose since it's a different test type. The CI `e2e-tests` job runs this suite on every push/PR and reports its own pass/fail in the checks tab, but isn't yet part of the required `report-ci-status` check set; see the graduation-criterion comment in `.github/workflows/ci.yml` for why.

### Before submitting a PR

- Run `pnpm run all` locally (lint, typecheck, tests, build)
- If you touched `test/e2e/` or any `#test/*` import target, also run `pnpm run test:e2e` locally: its CI job doesn't yet gate merges
- Follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages: this is what decides the next release version, so `fix:`, `feat:`, and a `BREAKING CHANGE` footer (or `!` before the colon) matter beyond style

(DCO / commit signing requirements are already covered by [.github/CONTRIBUTING-RULES.md](.github/CONTRIBUTING-RULES.md)'s baseline; not repeated here.)

## Releasing

Releases are automated with [semantic-release](https://github.com/semantic-release/semantic-release). Every push to `main` is analyzed for Conventional Commits since the last release: a `fix:` cuts a patch, a `feat:` cuts a minor, and a `BREAKING CHANGE` footer (or `!`) cuts a major. If nothing warrants a release, nothing happens. If something does, it bumps `package.json` and `CHANGELOG.md`, commits that to `main`, tags the release (e.g. `v8.1.0`), publishes the GitHub Release, and moves the floating major tag (e.g. `v8`) to point at it. No manual step, no per-PR file to write. The release configuration and workflow are managed centrally in [igorjs-iac/repo-config](https://github.com/igorjs-iac/repo-config) rather than committed to this repository, following the same pattern as `.github/CODEOWNERS` and the other files carrying a "Managed by" header; don't look for `.releaserc.json` here, and don't try to hand-roll one.
