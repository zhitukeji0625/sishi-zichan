import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

/** @type {import("eslint").Linter.Config[]} */
const eslintConfig = [
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/out/**",
      "**/build/**",
      "next-env.d.ts",
      "prisma/migrations/**",
    ],
  },
  ...nextCoreWebVitals,
];

export default eslintConfig;
