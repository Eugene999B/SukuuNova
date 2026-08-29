import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname
});

export default [
  {
    ignores: [".next/**", "node_modules/**", "coverage/**"]
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "react/no-unescaped-entities": "off"
    }
  },
  {
    files: ["src/components/FinanceWorkspace.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off"
    }
  },
  {
    files: ["src/components/PayrollWorkspace.tsx"],
    rules: {
      "@next/next/no-html-link-for-pages": "off"
    }
  }
];
