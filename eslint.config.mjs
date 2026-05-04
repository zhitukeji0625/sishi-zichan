import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/** ESLint 9 flat config：legacy `.eslintrc.json` + `next lint` 会触发循环 JSON 序列化错误 */
export default [...coreWebVitals, ...typescript];
