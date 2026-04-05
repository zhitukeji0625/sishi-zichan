import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

/** ESLint 9 flat config；避免 .eslintrc 与 next/core-web-vitals 组合导致的循环 JSON 序列化错误 */
export default [...nextCoreWebVitals];
