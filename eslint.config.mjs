import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

/** @type {import("eslint").Linter.Config[]} */
const eslintConfig = [
  {
    ignores: [
      "prisma/migrations/**",
      ".mariadb-data/**",
      "public/**",
    ],
  },
  ...nextCoreWebVitals,
];

export default eslintConfig;
