import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** Flat config from eslint-config-next 16 (ESLint 9); avoid FlatCompat circular JSON bug. */
const nextCoreWebVitals = require("eslint-config-next/core-web-vitals");
const nextTypescript = require("eslint-config-next/typescript");

export default [...nextCoreWebVitals, ...nextTypescript];
