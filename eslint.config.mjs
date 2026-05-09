import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [...coreWebVitals, ...nextTypescript];

/** @type {import("eslint").Linter.Config[]} */
export default eslintConfig;
