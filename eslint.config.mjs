import { createRequire } from "module";

const require = createRequire(import.meta.url);

/** Next.js 16 已导出 ESLint 9 扁平配置，勿再用 FlatCompat 包裹以免循环引用。 */
export default require("eslint-config-next/core-web-vitals");
