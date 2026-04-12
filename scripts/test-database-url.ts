/** Default URL matches docker-compose.test.yml (host port 3307). */
export const TEST_DATABASE_URL =
  process.env.DATABASE_URL ?? "mysql://root:root@127.0.0.1:3307/vitest_sishi";
