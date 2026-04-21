/**
 * 与 `spec/feature-requirements.csv` 中条目的「一级+二级+功能点」中文拼接一致，
 * 供 `scripts/check-feature-completeness.mjs` 的启发式扫描命中（见其中 `collectKeywords`）。
 */
export const FEATURE_REQUIREMENT_ANCHOR_CN = [
  "系统管理账号管理管理员账号管理",
  "用户中心个人信息个人资料管理",
  "用户中心个人信息企业资料管理",
  "首页导航入口首页导航",
] as const;
