import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/** @type {import("eslint").Linter.Config[]} */
const eslintConfig = [
  {
    ignores: ["public/**", "tsconfig.tsbuildinfo"],
  },
  ...coreWebVitals,
  ...nextTypescript,
];

export default eslintConfig;
