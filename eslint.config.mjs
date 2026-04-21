import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

/** @type {import("eslint").Linter.Config[]} */
const eslintConfig = [
  {
    ignores: ["node_modules/**", "coverage/**"],
  },
  ...nextCoreWebVitals,
];

export default eslintConfig;
