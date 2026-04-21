import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/** @type {import("eslint").Linter.Config[]} */
const eslintConfig = [
  {
    ignores: ["**/node_modules/**", "public/**", "prisma/migrations/**"],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
];

export default eslintConfig;
