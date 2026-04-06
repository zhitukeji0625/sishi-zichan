import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/** eslint-config-next 已导出 ESLint 9 flat config，勿再用 FlatCompat 包一层 */
const eslintConfig = [...coreWebVitals, ...typescript];
export default eslintConfig;
