const js = require("@eslint/js");
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const tsParser = require("@typescript-eslint/parser");
const globals = require("globals");

// Available global sets from the globals package:
// - globals.browser - Browser environment globals
// - globals.node - Node.js globals (includes CommonJS)
// - globals.nodeBuiltin - Node.js built-ins only (no CommonJS)
// - globals.es2015 to globals.es2025 - ECMAScript globals by year
// - globals.jest, globals.mocha, globals.jasmine, globals.vitest - Testing frameworks
// - globals.commonjs - CommonJS specific (require, module, exports)
// - globals.worker - Web Worker environment
// - globals.serviceworker - Service Worker environment
// - globals.jquery - jQuery globals
// - globals['shared-node-browser'] - Shared between Node.js and browsers

module.exports = [
  // Base JavaScript configuration
  js.configs.recommended,

  // JavaScript files configuration
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
  },

  // TypeScript configuration
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        project: "./tsconfig.json",
      },
      globals: {
        ...globals.node,
        ...globals.es2021,
        ...globals.jest,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "no-unused-vars": "off", // Turn off base rule as it's handled by TypeScript
    },
  },

  // Ignore patterns
  {
    ignores: [
      ".github/**",
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "*.config.js",
      "*.config.ts",
      "**/*.test.ts",
      "**/*.spec.ts",
    ],
  },
];
