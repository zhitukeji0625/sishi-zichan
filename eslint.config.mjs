import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/** 直接使用 eslint-config-next 导出的 flat config，避免 FlatCompat 触发循环引用校验错误。 */
const eslintConfig = [...coreWebVitals, ...typescript];
export default eslintConfig;
