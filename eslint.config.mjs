import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/** Next 16 已提供 flat config；勿再用 FlatCompat 转译，否则会触发循环引用校验错误 */
const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: ["prisma/seed*.ts"],
  },
];

export default eslintConfig;
