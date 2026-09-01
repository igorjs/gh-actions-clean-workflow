// SPDX-License-Identifier: MIT
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    restoreMocks: true,
    exclude: [...configDefaults.exclude, "test/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html", "json-summary"],
      include: ["src/**/*.ts"],
      // src/index.ts is a CLI entrypoint guard, covered by the e2e smoke test.
      exclude: ["src/**/*.d.ts", "src/config/types.ts", "src/index.ts"],
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 95,
        statements: 95,
      },
    },
  },
});
