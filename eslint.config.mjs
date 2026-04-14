import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const config = [
  ...require("eslint-config-next/core-web-vitals"),
  ...require("eslint-config-next/typescript"),
  {
    ignores: ["prisma/**", "public/**"],
  },
];

export default config;
