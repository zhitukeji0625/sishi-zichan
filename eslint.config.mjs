import coreWebVitals from "eslint-config-next/core-web-vitals";

/** @type {import("eslint").Linter.Config[]} */
const nextConfigs = Array.isArray(coreWebVitals)
  ? coreWebVitals
  : coreWebVitals.default;

const eslintConfig = [...nextConfigs];

export default eslintConfig;
