import { createRequire } from "module";

const require = createRequire(import.meta.url);

const nextEslintConfig = require("eslint-config-next/core-web-vitals");

/** @type {import("eslint").Linter.Config[]} */
const eslintConfig = [...nextEslintConfig];

export default eslintConfig;
