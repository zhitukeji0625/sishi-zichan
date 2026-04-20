import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** Next 16 已提供 ESLint 9 扁平配置；勿用 FlatCompat 包装，否则会触发循环引用校验错误。 */
const eslintConfig = [
  ...require("eslint-config-next/core-web-vitals"),
  ...require("eslint-config-next/typescript"),
  {
    ignores: ["public/uploads/**"],
  },
];

export default eslintConfig;
