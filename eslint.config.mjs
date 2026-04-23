import { createRequire } from "module";

const require = createRequire(import.meta.url);

/** @type {import("eslint").Linter.Config[]} */
const nextEslintConfig = require("eslint-config-next/core-web-vitals");

const eslintConfig = [
  {
    ignores: ["node_modules/**", "public/**"],
  },
  ...nextEslintConfig,
];

export default eslintConfig;
