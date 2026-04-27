import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/** ESLint 9 扁平配置：直接使用 eslint-config-next 导出的数组，避免 FlatCompat 与 react 插件循环引用 */
const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [".next/**", "node_modules/**", "public/uploads/**"],
  },
];

export default eslintConfig;
