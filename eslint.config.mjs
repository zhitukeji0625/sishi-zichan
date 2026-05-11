import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** @type {import("eslint").Linter.Config[]} */
const eslintConfig = [
  {
    ignores: ["**/node_modules/**", "prisma/migrations/**"],
  },
  ...require("eslint-config-next/core-web-vitals"),
];

export default eslintConfig;
