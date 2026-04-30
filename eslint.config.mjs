import { defineConfig } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/** @see https://nextjs.org/docs/app/api-reference/config/eslint */
export default defineConfig([...nextCoreWebVitals, ...nextTypescript]);
