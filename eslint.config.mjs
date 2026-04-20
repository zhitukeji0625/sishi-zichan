import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

/** eslint-config-next@16 已提供 flat config，直接展开即可（勿再用 FlatCompat）。 */
const eslintConfig = [
  { ignores: [".next/**", "node_modules/**", "public/**"] },
  ...nextCoreWebVitals,
];

export default eslintConfig;
