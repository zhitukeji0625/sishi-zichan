import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/** Native flat configs from eslint-config-next (avoid FlatCompat circular JSON bug). */
const eslintConfig = [...coreWebVitals, ...nextTypescript];
export default eslintConfig;
