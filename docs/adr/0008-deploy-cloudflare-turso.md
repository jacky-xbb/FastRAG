# 部署到 Cloudflare Workers + libSQL 换 Turso + 入库走 Workflow

## 状态

已采纳（2026-06-17）。把原本「本地 Node 全栈」改为「Cloudflare Workers 托管」，libSQL 由本地 `file:./vector.db` 换成 Turso 托管。

## 背景

原架构是本地跑：手写 `node:http` server（`src/web.ts`）同时跑 API + 托管 Vite 前端，libSQL 用本地 595MB 的 `vector.db`，PDF 入库走本地 CLI/接口（OCR 长轮询 + 写本地 `pdf/`、`ocr_cache/`）。要让外部可访问、免维护本机，需上云。

## 决策

- **运行形态**：Cloudflare Workers（`src/worker.ts` 的 fetch handler）。前端 `ui/dist` 由 Workers static assets 托管（`run_worker_first: ["/api/*"]`：API 进 Worker，其余走 assets，SPA 未命中回退 `index.html`）。`src/web.ts` 删除，本地开发用 `wrangler dev` + vite 代理。
- **数据库**：Turso（libSQL 托管）。`TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` 经 `process.env`（nodejs_compat 注入）传给 `LibSQLVector`/`LibSQLStore`/`createClient`。现有 595MB 库用 `turso db import` 整体迁移，保留向量与会话历史，不重 embedding。
- **关键技巧**：`@mastra/libsql` 硬 import `@libsql/client`（node 版，Workers 跑不通）。wrangler `alias` 把它换成 `@libsql/client/web`（fetch-based hrana，仅连远程，正合 Turso）。
- **Mastra 图必须懒构造**：Workers 禁止在「全局作用域（模块顶层）」做异步 I/O，而 `new LibSQLStore()`/`new Memory()`/`new Mastra()` 构造时会 fire-and-forget 调 `storage.init()` 连 Turso 建表。若在 `src/mastra/index.ts` 顶层 `new`，workerd 直接拒绝且把坏掉的 I/O 上下文绑死，后续进 handler 也救不回（`/api/threads` 500）。故整张图收进 `buildGraph()`，模块级单例缓存，**首次请求（handler 内）才实例化**；对外只导出 `getMastra()`/`getMemory()`/`getLibsqlVector()`。新增连库代码一律走 getter，别在顶层 `new`。（node 无此限制，旧 `src/web.ts` 从没踩到，迁 workerd 才暴露。）
- **入库上云**：OCR 轮询可达数分钟 + 分批 embed/upsert，超单次 Worker 时长，故走 **Cloudflare Workflow**（`src/ingest-workflow.ts`，持久/可重试）。PDF 原件与 OCR 缓存落 **R2**；入库进度逐 step 写 R2，前端轮询 `/api/ingest/status` 读取（替掉原 NDJSON 长流）。
- **入库管线双环境**：`src/lib/ingest-pipeline.ts` 去掉 `node:fs`、抽象出 `OcrCache` 接口；`ocr.ts` 改吃字节（非路径），IPv4 hack 用 guarded dynamic import（Node 生效、Workers no-op）。本地 CLI（`src/lib/ocr-cache-fs.ts` 的 fs 缓存）与云端（R2 缓存）共用同一管线。
- **CI/CD**：push main → `wrangler types` → typecheck → vitest → `ui:build` → `cloudflare/wrangler-action` 部署；检查不绿不部署。

## 代价 / 已知风险

- **Workers Paid 计划**：Worker 脚本 gzip ≈4.74MB（Mastra 较重），超免费档 3MiB 上限，须开 Workers Paid（$5/月，上限 10MiB）。
- **OCR 边缘连通性（最大风险）**：PaddleOCR 结果托管在百度 BCE，原本要 `node:dns`/`node:net` 强制 IPv4。Workers 无此 API、由 CF 边缘代连，能否拉到结果需上线实测；拉不到的退路是入库回退本地 CLI（`npm run ingest`，仍写 Turso）。
- **Mastra 运行时兼容**：打包已验证通过（`wrangler deploy --dry-run`）。本地 `wrangler dev` 已跑通登录 + `/api/threads`（需先做上面的「图必须懒构造」改造，否则全局作用域 I/O 报错）；agent.stream 等仍建议上线再确认一轮。
- **Turso 向量索引**：`turso db import` 后须验证 libSQL 原生向量索引存活（跑一次 query / `/api/library`）。

详见 [docs/部署-cloudflare.md](../部署-cloudflare.md)。
