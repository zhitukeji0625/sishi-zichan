import coreWebVitals from "eslint-config-next/core-web-vitals";

/** eslint-config-next 已导出 flat config，避免 FlatCompat 与 ESLint 9 的循环引用问题 */
const eslintConfig = [...coreWebVitals];
export default eslintConfig;
