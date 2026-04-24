import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/** ESLint 9 flat config — 避免 legacy `.eslintrc.json` 在序列化时出现循环引用。 */
export default [...coreWebVitals, ...typescript];
