import coreWebVitals from "eslint-config-next/core-web-vitals";

/** @type {import("eslint").Linter.Config[]} */
const eslintConfig = [
  {
    ignores: ["**/public/uploads/**"],
  },
  ...coreWebVitals,
];

export default eslintConfig;
