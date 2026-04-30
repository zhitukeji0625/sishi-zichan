import { createRequire } from "module";

const require = createRequire(import.meta.url);
const nextCoreWebVitals = require("eslint-config-next/core-web-vitals");
const nextTypescript = require("eslint-config-next/typescript");

/** eslint-config-next 16 已导出 ESLint 9 扁平配置，无需 FlatCompat（避免循环结构校验错误） */
const eslintConfig = [...nextCoreWebVitals, ...nextTypescript];
export default eslintConfig;
