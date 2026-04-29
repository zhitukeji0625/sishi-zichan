import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/** Next 16 已提供扁平 ESLint 配置，直接展开，避免 FlatCompat 与 next lint 的循环 JSON 序列化问题 */
export default [...coreWebVitals, ...typescript];
