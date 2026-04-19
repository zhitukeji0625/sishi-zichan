import coreWebVitals from "eslint-config-next/core-web-vitals";

/** ESLint 9 扁平配置：直接使用 eslint-config-next 导出的配置数组，避免 legacy JSON 与 FlatCompat 的循环引用问题。 */
export default [...coreWebVitals];
