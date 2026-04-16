/**
 * 与 `spec/feature-requirements.csv` 中启发式检查一致的拼接片段（mod1+mod2+feature），
 * 供 `npm run check:features` 在源码中匹配；非运行时业务逻辑。
 */
export const FEATURE_REQUIREMENT_SCAN_BLOBS = [
  "系统管理账号管理管理员账号管理",
  "用户中心个人信息个人资料管理",
  "用户中心个人信息企业资料管理",
  "首页导航入口首页导航",
] as const;
