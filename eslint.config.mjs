import coreWebVitals from "eslint-config-next/core-web-vitals";

/** Flat config required for eslint-config-next 16 + ESLint 9 (avoids .eslintrc circular JSON). */
export default [...coreWebVitals];
