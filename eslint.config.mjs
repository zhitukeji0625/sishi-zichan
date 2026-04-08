import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** Next 16 已提供 flat config；勿用 FlatCompat 包装，否则会触发循环结构校验错误。 */
const eslintConfig = [
  ...require("eslint-config-next/core-web-vitals"),
  ...require("eslint-config-next/typescript"),
];

export default eslintConfig;
