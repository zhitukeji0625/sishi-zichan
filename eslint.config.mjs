import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/** ESLint 9 扁平配置；勿再使用 `.eslintrc.json`（会与 flat 合并时触发循环 JSON 序列化）。 */
export default [...coreWebVitals, ...nextTypescript];
