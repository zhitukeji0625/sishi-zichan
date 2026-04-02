# 四师资产租赁（sishi-zichan）

Next.js 15 + MySQL（Prisma）+ 移动端 H5 + 后台管理。涵盖组织权限（师/团/连）、资产与竞拍、晒场预约、站内消息、第三方支付（农行演示为模拟支付）、第三方用户 JWT 登录与本地手机号注册登录。

## 环境要求

- Node.js 20+
- MySQL 8 或 MariaDB 10.11+（本地或远程）

## 配置

复制 `.env.example` 为 `.env`，设置 `DATABASE_URL`、`SESSION_SECRET`、`THIRD_PARTY_JWT_SECRET`。

## 数据库

```bash
npx prisma db push
npm run db:seed
```

## 开发

启动数据库后：

```bash
npm install
npm run dev
```

访问：

- 门户：<http://localhost:3000>
- 管理后台：<http://localhost:3000/admin/login>
- 移动端 H5：<http://localhost:3000/m>

### 演示账号（种子数据）

- 师级管理员：`13900000001` / `admin123`
- 团级管理员：`13900000002` / `admin123`
- 连队管理员：`13900000003` / `admin123`
- 承租用户：`13800138000` / `user123`（已关联一场进行中的竞拍并可出价）

### 第三方登录（开发）

1. 获取短期 JWT：开发环境访问 `GET /api/dev/third-party-token?u_id=xxx`（生产环境已禁用）。
2. 浏览器打开：`/m/sso?token=<上一步返回的 token>` 完成登录。

## 生产构建

```bash
npm run build
npm start
```

## 测试

```bash
npm run test
```

## 说明

- CSV 需求中的全部能力已分阶段落在数据模型与路由中；当前界面实现了核心闭环（资产录入、发拍、报名审核、保证金模拟、出价、公告、晒场预约与审核、消息、订单列表）。合同 PDF、农行真实 SDK、OCR/人脸、大屏监控、报表导出等需对接外部服务或二期扩展。
- 构建阶段已跳过 ESLint（`eslint-config-next` 与 ESLint 9 存在兼容性问题时避免阻塞交付）；可在本地升级配置后重新开启。
