import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/** ESLint 9 扁平配置；避免 legacy `.eslintrc.json` 触发 “Converting circular structure to JSON”。 */
export default [...coreWebVitals, ...typescript];
