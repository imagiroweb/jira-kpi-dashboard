module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    ecmaFeatures: { jsx: true },
    warnOnUnsupportedTypeScriptVersion: false,
  },
  plugins: ["@typescript-eslint", "react", "react-hooks", "react-refresh"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "plugin:react/jsx-runtime",
  ],
  settings: {
    react: { version: "detect" },
  },
  ignorePatterns: ["dist/", "build/", "node_modules/"],
  rules: {
    "@typescript-eslint/no-unused-vars": "warn",
    "@typescript-eslint/no-explicit-any": "warn",
    "prefer-const": "warn",
    "no-useless-escape": "warn",
    "react/no-unescaped-entities": "warn",
    "react/prop-types": "off",
    "react-refresh/only-export-components": [
      "warn",
      { allowConstantExport: true },
    ],
  },
};
