import coreWebVitals from "eslint-config-next/core-web-vitals";

/** Next.js 官方导出的扁平配置，避免 FlatCompat 与 ESLint 9 的循环引用问题 */
const eslintConfig = [
  ...coreWebVitals,
  {
    ignores: ["node_modules/**", "public/uploads/**"],
  },
];

export default eslintConfig;
