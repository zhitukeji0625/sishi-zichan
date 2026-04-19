import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: ["node_modules/**", ".next/**", "out/**", "public/uploads/**", "*.tsbuildinfo"],
  },
  ...coreWebVitals,
  ...nextTypescript,
];

export default eslintConfig;
