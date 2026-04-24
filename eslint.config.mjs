import coreWebVitals from "eslint-config-next/core-web-vitals";

/** Next.js 16 已提供 ESLint 9 flat 配置，直接展开即可（勿再用 FlatCompat 转译 legacy extends）。 */
const eslintConfig = [...coreWebVitals];

export default eslintConfig;
