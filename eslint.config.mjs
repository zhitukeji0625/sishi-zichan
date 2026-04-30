import coreWebVitals from "eslint-config-next/core-web-vitals";

/** Next 16 已提供 flat config；勿再用 FlatCompat 包裹 legacy extends（会触发循环 JSON 校验错误）。 */
const eslintConfig = [...coreWebVitals];

export default eslintConfig;
