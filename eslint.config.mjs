import coreWebVitals from "eslint-config-next/core-web-vitals";

/** @type {import("eslint").Linter.Config[]} */
const config = [
  {
    ignores: ["public/uploads/**", "coverage/**", "tsconfig.tsbuildinfo"],
  },
  ...coreWebVitals,
];

export default config;
