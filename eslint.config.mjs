import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

/** Next.js 16 的 shareable config 已是 ESLint 9 flat；勿再用 .eslintrc extends，否则会触发循环序列化错误 */
const eslintConfig = [...nextCoreWebVitals];
export default eslintConfig;
