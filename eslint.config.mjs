import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/** ESLint 9 扁平配置；避免 legacy .eslintrc 在 next lint 中出现循环引用 JSON 序列化错误。 */
export default [...coreWebVitals, ...typescript];
