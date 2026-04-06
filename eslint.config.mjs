import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

/** @type {import("eslint").Linter.Config[]} */
const config = [
  { ignores: [".next/**", "node_modules/**", "public/uploads/**"] },
  ...nextCoreWebVitals,
];

export default config;
