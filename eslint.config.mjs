import coreWebVitals from "eslint-config-next/core-web-vitals";

/** Next.js 16 已提供 ESLint 9 扁平配置，避免 FlatCompat 与插件循环引用问题 */
const eslintConfig = [...coreWebVitals];
export default eslintConfig;
