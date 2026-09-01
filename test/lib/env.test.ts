// SPDX-License-Identifier: MIT

import { setFailed, setOutput } from "@actions/core";
import { describe, expect, it } from "vitest";
import { makeDefaultEnv } from "#src/lib/env";

// makeDefaultEnv is the production composition root: the one place all real
// dependencies (@actions/core, @actions/github, node:timers/promises,
// Date.now) get wired together. It has no branches to unit-test in
// isolation, but an untested composition root is the one place a wiring
// mistake (wrong function passed to the wrong slot) would go unnoticed by
// every other test in the suite, since all of those inject their own fakes.
describe("env", () => {
  describe("makeDefaultEnv", () => {
    it("wires setFailed and setOutput directly to @actions/core's own exports", () => {
      const env = makeDefaultEnv();
      expect(env.setFailed).toBe(setFailed);
      expect(env.setOutput).toBe(setOutput);
    });

    it("builds a params object with the full Params shape", () => {
      const env = makeDefaultEnv();
      expect(env.params).toEqual(
        expect.objectContaining({
          getToken: expect.any(Function),
          getOwner: expect.any(Function),
          getRepo: expect.any(Function),
          getRunsToKeep: expect.any(Function),
          getRunsOlderThan: expect.any(Function),
          getDryRun: expect.any(Function),
          getWorkflowNames: expect.any(Function),
        })
      );
    });

    it("builds a getApi factory that produces a real Api instance from params", () => {
      const env = makeDefaultEnv();
      const api = env.getApi({
        token: "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCDEF",
        owner: "test-owner",
        repo: "test-repo",
      });
      expect(api.deleteRuns).toEqual(expect.any(Function));
      expect(api.getRunsToDelete).toEqual(expect.any(Function));
      expect(api.getMetrics).toEqual(expect.any(Function));
      // getMetrics is pure read of in-memory state (no network call), so
      // it's safe to invoke here to prove the api/circuit-breaker/retry
      // wiring produced a usable instance, not just an object with the
      // right method names.
      expect(api.getMetrics()).toEqual(
        expect.objectContaining({
          totalRequests: 0,
          circuitBreakerTrips: 0,
        })
      );
    });
  });
});
