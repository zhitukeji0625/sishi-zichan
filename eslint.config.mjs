import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/** @type {import("eslint").Linter.Config[]} */
export default [
  { ignores: ["node_modules/**", "public/**"] },
  ...coreWebVitals,
  ...typescript,
];
