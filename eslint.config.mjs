import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/** 与原先 extends next/core-web-vitals + next/typescript 等价，直接消费官方扁平配置。 */
const eslintConfig = [...coreWebVitals, ...typescript];

export default eslintConfig;
