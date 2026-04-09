import next from "eslint-config-next/core-web-vitals";

/** @type {import("eslint").Linter.Config[]} */
const eslintConfig = [
  {
    ignores: ["prisma/seed.ts"],
  },
  ...next,
];

export default eslintConfig;
