import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** @type {import("eslint").Linter.Config[]} */
const nextCoreWebVitals = require("eslint-config-next/core-web-vitals");
/** @type {import("eslint").Linter.Config[]} */
const nextTypescript = require("eslint-config-next/typescript");

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript];

export default eslintConfig;
