import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const ignoreConfig = {
  ignores: ["node_modules/**", "public/**", "coverage/**"],
};

/** @type {import("eslint").Linter.Config[]} */
const config = [ignoreConfig, ...nextCoreWebVitals];

export default config;
