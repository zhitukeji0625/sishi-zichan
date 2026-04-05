import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/** 直接使用 eslint-config-next 的 flat 导出，避免 FlatCompat 与 ESLint 9 校验循环引用问题。 */
const eslintConfig = [
  ...coreWebVitals,
  ...typescript,
  {
    ignores: ["public/uploads/**"],
  },
];

export default eslintConfig;
