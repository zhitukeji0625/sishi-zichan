import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

/** Native flat config from eslint-config-next (avoids FlatCompat circular JSON bug with ESLint 9). */
const eslintConfig = [...nextCoreWebVitals];
export default eslintConfig;
