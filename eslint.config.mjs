import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

/** @type {import("eslint").Linter.Config[]} */
const eslintConfig = [
  {
    ignores: ["public/uploads/**", "prisma/migrations/**"],
  },
  ...nextCoreWebVitals,
];

export default eslintConfig;
