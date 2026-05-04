import coreWebVitals from "eslint-config-next/core-web-vitals";

/** Uploaded / dynamic URLs — avoid next/image domain config churn */
const eslintConfig = [
  ...coreWebVitals,
  {
    files: [
      "src/app/admin/(app)/assets/page.tsx",
      "src/app/m/auction/**/page.tsx",
      "src/components/ImageUploader.tsx",
    ],
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
];

export default eslintConfig;
