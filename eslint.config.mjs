import coreWebVitals from "eslint-config-next/core-web-vitals";

/** @type {import("eslint").Linter.Config[]} */
const eslintConfig = [
  {
    ignores: [
      "node_modules/**",
      "public/uploads/**",
    ],
  },
  ...coreWebVitals,
];

export default eslintConfig;
