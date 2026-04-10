import coreWebVitals from "eslint-config-next/core-web-vitals";

/** @type {import("eslint").Linter.Config[]} */
const eslintConfig = [
  {
    ignores: ["public/uploads/**", "data/**"],
  },
  ...coreWebVitals,
];

export default eslintConfig;
