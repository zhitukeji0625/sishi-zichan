import nextCore from "eslint-config-next/core-web-vitals";

/** @type {import("eslint").Linter.Config[]} */
const nextConfigs = Array.isArray(nextCore) ? nextCore : [nextCore];

const eslintConfig = [...nextConfigs];

export default eslintConfig;
