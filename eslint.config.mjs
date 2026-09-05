import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname
});

const eslintConfig = [
  {
    ignores: [".next/**", "node_modules/**", "coverage/**", "next-env.d.ts"]
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "react/no-unescaped-entities": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }]
    }
  },
  {
    files: ["**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off"
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

export default eslintConfig;
