import coreWebVitals from "eslint-config-next/core-web-vitals";

/** ESLint 9 flat config：直接展开 Next 官方导出的数组，避免 legacy extends 的循环 JSON 校验错误 */
const eslintConfig = [...coreWebVitals];
export default eslintConfig;
