import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

/** ESLint 9：`eslint-config-next` 已导出 flat config，勿经 FlatCompat（会与 react 插件形成循环校验失败）。 */
const eslintConfig = [...nextCoreWebVitals];

export default eslintConfig;
