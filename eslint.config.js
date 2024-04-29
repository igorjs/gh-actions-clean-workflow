const js = require("@eslint/js");

module.exports = [
  {
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
      },
    },
  },
  {
    ignores: [".github/**", "dist/**", "node_modules/**"],
  },
  js.configs.recommended,
];
