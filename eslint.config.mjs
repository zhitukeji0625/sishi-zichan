import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/** Next 16 已提供 flat 配置，直接展开，避免 FlatCompat 与插件循环引用 */
const eslintConfig = [...coreWebVitals, ...typescript];
export default eslintConfig;
