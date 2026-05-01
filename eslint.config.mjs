import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/** 直接使用 eslint-config-next 的 flat 导出，避免 FlatCompat 与 ESLint 9 的循环 JSON 问题。 */
export default [...coreWebVitals, ...typescript];
