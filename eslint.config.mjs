import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/** 使用包内导出的 flat 配置，避免 legacy extends 在 ESLint 9 下的循环引用错误 */
const eslintConfig = [...coreWebVitals, ...typescript];
export default eslintConfig;
