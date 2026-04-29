import path from "node:path";
import { fileURLToPath } from "node:url";
import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** ESLint 9 flat config：避免 legacy `.eslintrc` 与 `eslint-config-next` 组合时出现 circular JSON 错误 */
export default [
  { ignores: ["node_modules/**", ".next/**", "out/**", "build/**"] },
  ...coreWebVitals,
  ...nextTypescript,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
  },
];
