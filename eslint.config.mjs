import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** Next.js 16 提供的 ESLint 扁平配置（含 TypeScript） */
const nextConfig = require("eslint-config-next/core-web-vitals");

const eslintConfig = [{ ignores: ["node_modules/**"] }, ...nextConfig];

export default eslintConfig;
