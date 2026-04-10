import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

/** ESLint 9 扁平配置；避免 legacy .eslintrc 与 eslint-config-next 16 组合时的循环 JSON 序列化错误 */
export default [...nextCoreWebVitals];
