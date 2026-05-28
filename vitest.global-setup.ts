/**
 * 预留全局钩子（如 CI 预热）。数据库检测与 schema 同步见 vitest.setup.ts（在各 worker 内执行）。
 */
export default async function globalSetup() {
  // no-op
}
