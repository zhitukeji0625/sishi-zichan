import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/** ESLint 9 flat config（与 eslint-config-next 16 配套，避免 legacy .eslintrc 的循环引用错误） */
const eslintConfig = [...coreWebVitals, ...typescript];
export default eslintConfig;
