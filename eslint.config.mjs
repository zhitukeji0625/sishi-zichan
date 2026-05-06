import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/** ESLint 9 flat config（避免 legacy `.eslintrc` 触发 circular JSON） */
export default [...coreWebVitals, ...typescript];
