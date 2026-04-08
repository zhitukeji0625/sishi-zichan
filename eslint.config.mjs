import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/** 与 extends: next/core-web-vitals + next/typescript 等价，兼容 ESLint 9 扁平配置 */
const eslintConfig = [...coreWebVitals, ...nextTypescript];
export default eslintConfig;
