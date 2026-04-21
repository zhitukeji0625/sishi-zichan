import next from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/** @type {import("eslint").Linter.Config[]} */
const config = [
  { ignores: ["public/uploads/**"] },
  ...next,
  ...nextTs,
];

export default config;
