import nextConfig from "eslint-config-next";

const config = [
  ...nextConfig,
  { ignores: ["public/uploads/**"] },
];

export default config;
