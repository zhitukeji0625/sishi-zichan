import coreWebVitals from "eslint-config-next/core-web-vitals";

/** Next.js 16 以扁平数组导出；直接展开，避免 FlatCompat 与 ESLint 9 的循环 JSON 校验问题 */
const eslintConfig = [
  ...coreWebVitals,
  {
    ignores: ["public/uploads/**"],
  },
];

export default eslintConfig;
