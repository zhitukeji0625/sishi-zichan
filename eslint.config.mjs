import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** @type {import("eslint").Linter.Config[]} */
const nextConfigs = require("eslint-config-next/core-web-vitals");
const typescriptConfigs = require("eslint-config-next/typescript");

export default [
  ...nextConfigs,
  ...typescriptConfigs,
  {
    ignores: ["public/uploads/**"],
  },
];
