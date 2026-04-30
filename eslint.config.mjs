import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/** ESLint 9 flat config; replaces legacy .eslintrc.json for `next lint`. */
export default [...coreWebVitals, ...typescript];
