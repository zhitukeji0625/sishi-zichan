import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

/** 直接使用 eslint-config-next 的扁平配置，避免 FlatCompat + ESLint 9 的循环引用问题 */
const eslintConfig = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "public/uploads/**",
    ],
  },
  ...nextCoreWebVitals,
];

export default eslintConfig;
