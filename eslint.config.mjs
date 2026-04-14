import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/** eslint-config-next 16+ 导出扁平配置数组，供 ESLint 9 使用。 */
const eslintConfig = [...nextCoreWebVitals, ...nextTypescript];
export default eslintConfig;
