module.exports = {
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@figma/figma-plugins/recommended",
    "prettier", // Prettier와 충돌하는 ESLint 규칙 비활성화
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: ["./tsconfig.json"],
  },
  root: true,
  ignorePatterns: ["*.config.js", "*.config.ts", "dist/", "node_modules/"],
  overrides: [
    {
      files: ["*.js", "*.cjs", "*.mjs"],
      parser: "espree",
      parserOptions: {
        ecmaVersion: 2020,
      },
    },
  ],
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "warn",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      },
    ],
    "@typescript-eslint/no-explicit-any": "off",
  },
};
