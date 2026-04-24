import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/** ESLint 9 flat config — 避免 `next lint` 将 legacy 配置序列化为 JSON 时的循环引用错误 */
const eslintConfig = [...coreWebVitals, ...typescript];
export default eslintConfig;
