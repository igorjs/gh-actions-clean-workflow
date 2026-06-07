# FP Refactor + pure-test Migration

**Date:** 2026-06-07
**Branch:** `refactor/fp-pure-test`

## Goal

Migrate from Vitest to `@igorjs/pure-test` and refactor the source into a
functional-programming style so that every dependency is injected rather than
imported at module scope. No `vi.mock()` / module interception anywhere.

---

## Architecture

### Principle

Each module exports a **factory function** that takes its dep surface and
returns its operations (curried factory pattern). Dependencies are resolved
once at the boundary; call sites are clean. The real entry point wires the
real deps; tests wire stubs directly — no module mocking required.

### Module map

| Module | Factory | Dep surface | Returns |
|---|---|---|---|
| `params.ts` | `makeParams(deps)` | `{ getInput }` | `Params` bundle |
| `retry.ts` | `makeRetry(deps)` | `{ sleep }` | `withRetry` fn |
| `circuit-breaker.ts` | `createCircuitBreaker()` | none | `CircuitBreaker` object |
| `api.ts` | `makeApi(deps)(params)` | `{ getOctokit, sleep }` | `Api` object |
| `index.ts` | `run(env?)` | `RunEnv` (optional, defaults to real deps) | `Promise<void>` |
| `logger.ts` | unchanged | none | logging fns |

---

## Type signatures

```ts
// ── deps ──────────────────────────────────────────────────────────────
type ParamsDeps = {
  getInput: (name: string, opts?: { required?: boolean; trimWhitespace?: boolean }) => string
}

type ApiDeps = {
  getOctokit: (token: string) => Octokit
  sleep: (ms: number) => Promise<void>
}

type RetryDeps = {
  sleep: (ms: number) => Promise<void>
}

// ── returned bundles ──────────────────────────────────────────────────
type Params = {
  getToken: () => string
  getOwner: () => string
  getRepo: () => string
  getRunsToKeep: () => number
  getRunsOlderThan: () => number
  getDryRun: () => boolean
  getWorkflowNames: () => string[]
}

// ── top-level env ─────────────────────────────────────────────────────
type RunEnv = {
  params: Params
  getApi: (p: ApiParams, deps: ApiDeps) => Api
  setFailed: (msg: string) => void
  setOutput: (name: string, value: string) => void
  sleep: (ms: number) => Promise<void>
}
```

---

## Module-by-module changes

### `params.ts`

- Export `makeParams(deps: ParamsDeps): Params`
- All seven getter functions become closures over `deps.getInput`
- Remove top-level `import { getInput } from '@actions/core'`

### `circuit-breaker.ts`

- Remove `class CircuitBreaker`
- Export `createCircuitBreaker(): CircuitBreakerHandle` where the handle is a
  plain object `{ canExecute, recordSuccess, recordFailure, getState }`
- Internal state (state, failures, successes, lastFailureTime) held in closure
  variables — no class, no `this`

### `retry.ts`

- Export `makeRetry(deps: RetryDeps): typeof withRetry`
- `sleep` closed over from deps instead of imported from `node:timers/promises`
- Remove top-level `import { setTimeout } from 'node:timers/promises'`

### `api.ts`

- Export `makeApi(deps: ApiDeps): (params: ApiParams) => Api`
- `getOctokit` and `sleep` closed over from deps
- Internally calls `makeRetry({ sleep })` to get `withRetry`
- Internally calls `createCircuitBreaker()` per api instance
- Remove top-level imports of `@actions/github` and `node:timers/promises`

### `index.ts`

- Export `run(env?: RunEnv): Promise<void>`
- Default env assembled from real imports when no arg passed:
  ```ts
  const defaultEnv: RunEnv = {
    params: makeParams({ getInput }),
    getApi: makeApi,
    setFailed,
    setOutput,
    sleep: nodeSetTimeout,
  }
  ```
- `run()` at the bottom of the file calls `run()` with no arg (unchanged
  behaviour for the GitHub Actions runtime)

### `config/types.ts`

- Add `ParamsDeps`, `ApiDeps`, `RetryDeps`, `RunEnv`, `Params`,
  `CircuitBreakerHandle` types
- Keep existing `Api`, `ApiParams`, `ApiMetrics`, etc.

---

## Test changes

### Tooling swap

| Remove | Add |
|---|---|
| `vitest` | `@igorjs/pure-test` |
| `@vitest/coverage-v8` | `c8` |
| `vitest.config.ts` | `.c8rc.json` |

`package.json` scripts:
```json
"test":          "pure-test src --ts",
"test:coverage": "c8 pure-test src --ts"
```

`.c8rc.json`:
```json
{
  "reporter": ["text", "lcov", "html"],
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts"],
  "lines": 90,
  "functions": 90,
  "branches": 85,
  "statements": 90
}
```

### Test pattern per file

**`params.test.ts`**
```ts
import { describe, it, expect, spyFn } from '@igorjs/pure-test'
import { makeParams } from './params'

const getInput = spyFn()
const { getToken } = makeParams({ getInput })

getInput.mockReturnValue('ghs_abc.def-ghi')
expect(getToken()).toBe('ghs_abc.def-ghi')
```

**`circuit-breaker.test.ts`**
```ts
import { createCircuitBreaker } from './circuit-breaker'
// no mocks needed — pure closure
const cb = createCircuitBreaker()
```

**`api.test.ts`**
```ts
import { spyFn } from '@igorjs/pure-test'
import { makeApi } from './api'

const sleep = spyFn().mockResolvedValue(undefined)
const mockOctokit = { paginate: { iterator: spyFn() }, rest: { actions: { ... } } }
const getOctokit = spyFn().mockReturnValue(mockOctokit)
const api = makeApi({ getOctokit, sleep })({ token, owner, repo })
```

**`index.test.ts`**
```ts
import { spyFn } from '@igorjs/pure-test'
import { run } from './index'

const env = {
  params: { getToken: spyFn().mockReturnValue('ghp_...'), ... },
  getApi: spyFn().mockReturnValue({ deleteRuns: spyFn(), ... }),
  setFailed: spyFn(),
  setOutput: spyFn(),
  sleep: spyFn().mockResolvedValue(undefined),
}
await run(env)
```

---

## What does NOT change

- `logger.ts` — no external deps, no changes
- `config/constants.ts` — no changes
- `action.yml` / workflows / README — no changes
- All existing test assertions — only the setup/mock boilerplate changes

---

## Out of scope

- Runtime support beyond Node.js (pure-test supports Deno/Bun but this action
  runs on Node; no cross-runtime work needed)
- Snapshot testing (pure-test doesn't support it; none used today)
- Benchmark tests
