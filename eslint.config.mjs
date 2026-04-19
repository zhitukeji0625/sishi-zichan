import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/** eslint-config-next 已提供 ESLint 9 扁平配置，勿再用 FlatCompat 包一层（会触发循环引用校验错误）。 */
export default [...coreWebVitals, ...typescript];
