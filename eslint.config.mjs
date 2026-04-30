import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

/** 直接使用 eslint-config-next 导出的 flat 配置，避免 FlatCompat 触发 ESLint 9 循环 JSON 校验错误 */
const eslintConfig = [...coreWebVitals, ...nextTypeScript];
export default eslintConfig;
