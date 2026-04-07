import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/** ESLint 9 flat config — avoids legacy `.eslintrc` + `next lint` circular JSON error */
export default [...coreWebVitals, ...typescript];
