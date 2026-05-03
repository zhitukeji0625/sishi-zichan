import next from "eslint-config-next";

/** ESLint 9 扁平配置；避免 legacy `.eslintrc` 触发 “Converting circular structure to JSON”。 */
const config = [...next];

export default config;
