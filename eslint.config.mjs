import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/** ESLint 9 flat config；避免 legacy `.eslintrc.json` 触发 “Converting circular structure to JSON”。 */
export default [...coreWebVitals, ...nextTypescript];
