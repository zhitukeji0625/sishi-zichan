import next from "eslint-config-next/core-web-vitals";

/** @type {import("eslint").Linter.Config[]} */
const eslintConfig = [
  ...next,
  {
    ignores: ["public/uploads/**"],
  },
];

export default eslintConfig;
