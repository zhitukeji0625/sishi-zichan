import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextCoreWebVitals = require("eslint-config-next/core-web-vitals");

/** eslint-config-next v16+ 为 flat config，与 .eslintrc 不兼容 */
const eslintConfig = [...nextCoreWebVitals];
export default eslintConfig;
