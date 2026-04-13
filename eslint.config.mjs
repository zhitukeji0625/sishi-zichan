import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

/** ESLint 9 flat config：避免 legacy `.eslintrc.json` 触发 “Converting circular structure to JSON”。 */
export default [...nextCoreWebVitals];
