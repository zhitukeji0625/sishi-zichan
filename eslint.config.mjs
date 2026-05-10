import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "public/**",
      "prisma/migrations/**",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
];
