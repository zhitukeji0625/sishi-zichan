import { createRequire } from "module";

const require = createRequire(import.meta.url);

/** @type {import("eslint").Linter.Config[]} */
const eslintConfig = [
  { ignores: ["public/uploads/**"] },
  ...require("eslint-config-next/core-web-vitals"),
  ...require("eslint-config-next/typescript"),
];

export default eslintConfig;
