import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** Next.js 16 已导出 ESLint 扁平配置数组，勿用 FlatCompat 包裹（会触发循环引用校验错误）。 */
const coreWebVitals = require("eslint-config-next/core-web-vitals");
const typescript = require("eslint-config-next/typescript");

const eslintConfig = [
  ...coreWebVitals,
  ...typescript,
  {
    ignores: ["public/uploads/**"],
  },
];

export default eslintConfig;
