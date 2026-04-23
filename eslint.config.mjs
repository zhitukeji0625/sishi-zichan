import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/** ESLint 9 flat config；与 eslint-config-next 16 的导出的配置数组直接合并。 */
const eslintConfig = [...coreWebVitals, ...typescript];
export default eslintConfig;
