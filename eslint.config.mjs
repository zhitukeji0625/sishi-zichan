import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

/** Next 16 已导出 flat config；勿用 FlatCompat，会与 ESLint 9 校验冲突 */
const eslintConfig = [...nextCoreWebVitals];
export default eslintConfig;
