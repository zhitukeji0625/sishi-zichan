import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** @type {import("eslint").Linter.Config[]} */
const nextCoreWebVitals = require("eslint-config-next/core-web-vitals");
/** @type {import("eslint").Linter.Config[]} */
const nextTypescript = require("eslint-config-next/typescript");

export default [
  {
    ignores: ["node_modules/**", "public/**", "*.config.*"],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
];
