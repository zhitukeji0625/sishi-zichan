import { createRequire } from "module";

const require = createRequire(import.meta.url);

/** Next.js 官方扁平配置（避免 FlatCompat 在 ESLint 9 下的循环引用问题） */
const coreWebVitals = require("eslint-config-next/core-web-vitals");
const typescript = require("eslint-config-next/typescript");

const eslintConfig = [
  {
    ignores: [
      "public/uploads/**",
      "*.config.*.timestamp-*",
    ],
  },
  ...coreWebVitals,
  ...typescript,
];

export default eslintConfig;
