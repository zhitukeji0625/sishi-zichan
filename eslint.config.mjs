import nextCore from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/** eslint-config-next 16 已导出 flat config，勿再用 FlatCompat 包裹（会与 ESLint 9 校验冲突）。 */
const eslintConfig = [...nextCore, ...nextTs];
export default eslintConfig;
