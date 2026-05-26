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

## 部署与预览 URL

本仓库**不会自动生成**公网地址；预览链接来自你选择的托管平台。

### 方式 A：Docker Compose（任意云主机 / 内网）

在一台已安装 [Docker](https://docs.docker.com/get-docker/) 的机器上：

```bash
git clone https://github.com/zhitukeji0625/sishi-zichan.git
cd sishi-zichan
git checkout cursor/-bc-3d90e3cd-56d5-478b-b73d-426145302072-c87a
cp .env.deploy.example .env   # 编辑 SESSION_SECRET、THIRD_PARTY_JWT_SECRET、NEXT_PUBLIC_APP_URL
export APP_PORT=19084           # 可选，默认 19084（见下方「与 18084 反代」）
docker compose up -d --build
```

首次启动会执行 `prisma db push` 与 `db:seed`。默认 Docker 映射 **19084** → 容器 3000；若宝塔 **18084** 反代到 `127.0.0.1:19084`，用户访问：

- **预览入口**：`http://<服务器IP>:18084`
- H5：`http://<服务器IP>:18084/m`
- 管理端：`http://<服务器IP>:18084/admin/login`

无反代时可直接访问 `http://<服务器IP>:19084`。`.env` 中 `NEXT_PUBLIC_APP_URL` 请与浏览器实际地址一致（反代用 `:18084`）。

**纯 HTTP 部署**：Docker Compose 已设置 `COOKIE_SECURE=false`；若生产环境全站 **HTTPS**，请将 `docker-compose.yml` 中 `COOKIE_SECURE` 改为 `"true"`，否则浏览器在 HTTP 下不会保存登录 Cookie。

生产环境请修改 `.env` 中的密钥与 `NEXT_PUBLIC_APP_URL`；`docker-compose` 中数据库 **不映射到宿主机**，仅 `app` 容器可访问。若公网拉取 `mysql:8` 镜像失败，可改用本仓库默认的 **MariaDB 11**（与 Prisma `mysql` 连接串兼容）。

### 方式 B：Vercel 等 Serverless（需外置 MySQL）

将项目连接 **PlanetScale / Neon（不适用 MySQL）/ 云 RDS MySQL** 等，在面板配置环境变量 `DATABASE_URL`、`SESSION_SECRET`、`THIRD_PARTY_JWT_SECRET`、`NEXT_PUBLIC_APP_URL`。  
若已关联 GitHub，合并或打开 PR 后可在 Vercel 控制台查看 **Preview Deployment** 的域名（形如 `https://xxx.vercel.app`）。

### 当前 PR

草稿 PR：<https://github.com/zhitukeji0625/sishi-zichan/pull/1> — 部署成功后把该环境域名当作「预览版本」即可。

## 测试

需先执行 `npm install`。`npm run test` 使用 Vitest；`src/lib/__tests__/` 中含依赖数据库的集成用例。未配置 `.env` 时测试会默认尝试连接 `mysql://root:root@127.0.0.1:3306/sishi`（与 `vitest.config.ts` 一致）。数据库未启动时相关用例会自动跳过；若要在 CI 或本地强制要求数据库可用，可设置环境变量 `VITEST_REQUIRE_DB=1`。

```bash
npm run test
```

## 说明

- CSV 需求中的全部能力已分阶段落在数据模型与路由中；当前界面实现了核心闭环（资产录入、发拍、报名审核、保证金模拟、出价、公告、晒场预约与审核、消息、订单列表）。合同 PDF、农行真实 SDK、OCR/人脸、大屏监控、报表导出等需对接外部服务或二期扩展。
- 构建阶段已跳过 ESLint（`eslint-config-next` 与 ESLint 9 存在兼容性问题时避免阻塞交付）；可在本地升级配置后重新开启。
