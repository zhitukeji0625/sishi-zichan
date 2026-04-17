import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

/** ESLint 9 flat config：直接使用 Next 导出的 flat 配置，避免 legacy .eslintrc 与 ESLint 9 的循环 JSON 序列化错误 */
export default [...nextCoreWebVitals];
