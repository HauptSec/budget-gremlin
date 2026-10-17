import tseslint from "typescript-eslint";
export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "docs/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      "no-debugger": "error",
      "no-unreachable": "error",
      "no-constant-condition": "error",
      "no-unsafe-finally": "error",
      "constructor-super": "error",
      "valid-typeof": "error",
    },
  },
];
