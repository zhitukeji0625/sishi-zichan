import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

/** ESLint 9 扁平配置；避免 legacy `.eslintrc` 触发 “Converting circular structure to JSON”。 */
const eslintConfig = [...nextCoreWebVitals];

export default eslintConfig;
