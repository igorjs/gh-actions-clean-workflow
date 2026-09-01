// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { ApiMetrics } from "#src/config/types";
import { computeOutputs } from "#src/core/reporting";

const ROOT = resolve(import.meta.dirname, "..", "..");

/**
 * Extracts the top-level (2-space indented) keys from a named block in
 * action.yml, e.g. the `inputs:` or `outputs:` map. Regex-based on purpose:
 * a runtime spy on makeParams/exportMetrics would pass even if a value is
 * read but never used, which is the weaker guarantee. Parsing the manifest
 * as text and cross-referencing literal string usage in src/ is a stronger,
 * more direct contract check and avoids adding a YAML parser dependency.
 */
function extractManifestKeys(yaml: string, blockName: string): string[] {
  const lines = yaml.split("\n");
  const blockHeader = `${blockName}:`;
  const startIndex = lines.indexOf(blockHeader);
  if (startIndex === -1)
    throw new Error(`action.yml has no "${blockName}:" block`);

  const keys: string[] = [];
  for (const line of lines.slice(startIndex + 1)) {
    if (line.length > 0 && !line.startsWith(" ")) break; // next top-level key
    const match = /^ {2}([a-zA-Z0-9_-]+):/.exec(line);
    if (match) keys.push(match[1]);
  }
  return keys;
}

describe("action.yml contract", () => {
  const actionYml = readFileSync(resolve(ROOT, "action.yml"), "utf8");
  const paramsSrc = readFileSync(
    resolve(ROOT, "src", "lib", "params.ts"),
    "utf8"
  );

  const declaredInputs = extractManifestKeys(actionYml, "inputs");
  const declaredOutputs = extractManifestKeys(actionYml, "outputs");

  const readInputs = new Set(
    [...paramsSrc.matchAll(/getInput\(\s*["']([a-zA-Z0-9_]+)["']/g)].map(
      (m) => m[1]
    )
  );

  // exportMetrics in src/main.ts delegates to computeOutputs for the
  // key/value mapping, so the output keys no longer appear as literal
  // setOut(...) calls in main.ts's source text. Calling computeOutputs
  // directly and inspecting its returned keys is a more robust contract
  // check: it survives future refactors of how exportMetrics wires the
  // mapping into setOutput.
  const zeroMetrics: ApiMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    retries: 0,
    rateLimitHits: 0,
    circuitBreakerTrips: 0,
  };
  const writtenOutputs = new Set(
    Object.keys(computeOutputs(0, 0, 0, zeroMetrics))
  );

  it("declares at least one input and one output (parsing sanity check)", () => {
    expect(declaredInputs.length).toBeGreaterThan(0);
    expect(declaredOutputs.length).toBeGreaterThan(0);
  });

  it.each(declaredInputs)(
    "input '%s' declared in action.yml is read by makeParams",
    (input) => {
      expect(readInputs.has(input)).toBe(true);
    }
  );

  it.each(declaredOutputs)(
    "output '%s' declared in action.yml is written by exportMetrics",
    (output) => {
      expect(writtenOutputs.has(output)).toBe(true);
    }
  );
});
