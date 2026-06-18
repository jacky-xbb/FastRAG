# 部署到 Cloudflare（Workers + Turso）运维手册

> ⚠️ **已废弃**：Cloudflare 部署 2026-06-18 退役，现用 fly.io（见 [docs/部署-fly.md](部署-fly.md) 与 [ADR-0010](adr/0010-deploy-fly-local-volume.md)）。本文仅作历史参考。

选型与取舍见 [ADR-0008](adr/0008-deploy-cloudflare-turso.md)。本文是一次性落地的操作步骤。

## 前置

- Cloudflare 账号，**Workers Paid 计划**（$5/月）——Worker 脚本 gzip ≈4.74MB 超免费档 3MiB 上限。
- 安装 Turso CLI：`curl -sSfL https://get.tur.so/install.sh | bash`，`turso auth login`。
- 本机已能跑通本地版（`.env` 里各 key 齐全）。

## 1. 迁移现有库到 Turso

```bash
# 用现有 595MB 本地库整体导入（保留向量 + 会话历史，不重 embedding）
turso db create fastrag --from-file vector.db
turso db show fastrag --url                 # 拿 libsql://… → TURSO_DATABASE_URL
turso db tokens create fastrag              # 拿 token → TURSO_AUTH_TOKEN
```

**验证向量索引存活**：导入后本地连 Turso 跑一遍读路径（下面第 4 步 `wrangler dev` 起来后访问 `/api/library` 与问一条已知指标）。若向量检索为空，说明 libSQL 原生向量索引没随导入带过来——则需重灌（`npm run ingest -- --all`，OCR 缓存命中、仅重 embed）。

## 2. 建 R2 桶

```bash
npx wrangler r2 bucket create fastrag        # 对应 wrangler.jsonc 的 BUCKET 绑定
```

## 3. 配 Worker 运行时 secrets（CF 侧一次性）

```bash
for k in OPENROUTER_API_KEY PADDLE_API_KEY TAVILY_API_KEY \
         TURSO_DATABASE_URL TURSO_AUTH_TOKEN \
         ADMIN_USER ADMIN_PASSWORD SESSION_SECRET; do
  npx wrangler secret put "$k"
done
```

## 4. 本地联调（连 Turso）

`.env` 填上 `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`（其余 key 照旧），然后：

```bash
npm run ui:build          # wrangler dev 托管 ui/dist（assets）
npm run dev               # wrangler dev(:8787) + vite(:5173，/api 代理到 8787)
```

访问 http://localhost:5173 ：登录 → 问一条已知国标指标（验混合检索 + 会话历史）→ 看 `/api/library` 列表是否与库一致。

## 5. 部署

```bash
npm run deploy            # = ui:build && wrangler deploy
```

或推到 main 由 GitHub Actions 自动部署（见下）。

## 6. CI/CD（push main 自动部署）

`.github/workflows/deploy.yml` 已就位：push main → `wrangler types` → typecheck → vitest → `ui:build` → 部署。仓库 **Settings → Secrets and variables → Actions** 配两个：

- `CLOUDFLARE_API_TOKEN`：[创建 token](https://dash.cloudflare.com/profile/api-tokens)，权限含 Workers Scripts:Edit、Workers R2 Storage:Edit、Workflows:Edit、Account Settings:Read。
- `CLOUDFLARE_ACCOUNT_ID`：dashboard 右侧栏的 Account ID。

> Worker 运行时 secrets（OPENROUTER/TURSO_* 等）只在 CF 侧配一次（第 3 步），CI 不重复推。

## 7. 上线后必验（端到端）

1. `/api/chat` 问一条已知指标 → 混合检索 + 会话历史正常（验 **Mastra 运行时兼容**）。
2. **上传一个 PDF**：轮询进度跑完 Workflow → 新块可被检索到。这一步验**最大风险**：CF 边缘能否拉到百度 BCE 的 OCR 结果。
   - 若 OCR 步骤报错/卡住 → 边缘拉不到 BCE。退路：本地 `npm run ingest -- "pdf/xxx.pdf"`（仍写 Turso，IPv4 hack 在 Node 下生效），云端只读问答不受影响。

## 故障排查

| 现象 | 可能原因 | 处理 |
| --- | --- | --- |
| 部署报脚本超限 | 未开 Workers Paid | 开 Paid（脚本 4.74MB < 10MiB 上限） |
| 检索全空 | Turso 向量索引未随导入存活 | `npm run ingest -- --all` 重灌（仅重 embed） |
| 入库 OCR 卡住/报错 | CF 边缘拉不到百度 BCE | 改用本地 CLI 入库（见第 7 步退路） |
| 登录 401 / cookie 不带 | SESSION_SECRET 未配或跨域 | 确认 secret 已配；同源访问（workers.dev 域名） |
