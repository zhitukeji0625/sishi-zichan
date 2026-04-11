import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const asArray = (mod) => (Array.isArray(mod) ? mod : mod.default ?? []);

export default [...asArray(coreWebVitals), ...asArray(typescript)];
