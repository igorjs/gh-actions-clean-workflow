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
      exclude: ["src/**/*.d.ts", "src/config/types.ts"],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
