import coreWebVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  ...coreWebVitals,
  {
    ignores: ["public/uploads/**"],
  },
];

export default eslintConfig;
