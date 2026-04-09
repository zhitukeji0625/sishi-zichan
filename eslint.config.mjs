import coreWebVitals from "eslint-config-next/core-web-vitals";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...coreWebVitals,
  {
    files: [
      "src/components/ImageUploader.tsx",
      "src/app/m/auction/**/page.tsx",
      "src/app/admin/(app)/assets/page.tsx",
    ],
    rules: {
      // 管理端/用户上传的 URL 为动态路径，不强制 next/image 与 remotePatterns
      "@next/next/no-img-element": "off",
    },
  },
];
