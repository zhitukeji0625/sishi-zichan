import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...coreWebVitals,
  ...typescript,
  {
    ignores: ["eslint.config.mjs", "postcss.config.mjs"],
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
  },
];
