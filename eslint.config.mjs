import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const coreWebVitals = require("eslint-config-next/core-web-vitals");
const typescript = require("eslint-config-next/typescript");

const eslintConfig = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "public/uploads/**",
      "*.tsbuildinfo",
    ],
  },
  ...coreWebVitals,
  ...typescript,
];

export default eslintConfig;
