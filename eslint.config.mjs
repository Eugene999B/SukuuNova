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
    files: ["src/components/FinanceWorkspace.tsx", "src/components/FinanceWorkspaceSafe.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@next/next/no-html-link-for-pages": "off"
    }
  },
  {
    files: [
      "src/components/FinanceV2Workspace.tsx",
      "src/components/PayrollV2Workspace.tsx",
      "src/lib/finance-v2-service.ts",
      "src/lib/payroll-v2-service.ts",
      "src/app/api/school/finance-v2/receipt/**/route.ts"
    ],
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
