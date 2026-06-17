# 增加 fly.io 部署路径（常驻 Node 进程 + 本地卷 libSQL），与 Cloudflare 双轨并存

## 状态

已采纳（2026-06-17）。在 [ADR-0008](0008-deploy-cloudflare-turso.md) 的 Cloudflare 部署之外，**新增**一条 fly.io 部署路径，两条并存（双轨），不互相替代。

## 背景

Cloudflare 那套要 Workers Paid（脚本 4.74MB 超免费档）、libSQL 必须托管在 Turso（远程），且入库被迫拆成 Workflow。想要一条「一台常驻机器 + 本地文件库」的更简单、更省、磁盘 IO 更好的部署形态——fly.io 容器正合适：能直接跑原生 `@libsql/client` + `file:`，长任务进程内跑即可。本库实际数据仅 ~19M（[ADR-0009](0009-drop-vector-index-bruteforce.md) 去索引后更小），fly volume 本地 NVMe 性能绰绰有余；真正的延迟瓶颈在 LLM/OCR 外部 API，与机房选型基本无关。

## 决策

- **共享路由**：把 `src/worker.ts` 的全部路由逻辑抽到 `src/app.ts`，对外部能力只依赖一个最小结构接口 `AppEnv`（`BUCKET` / `INGEST_WORKFLOW` / `ASSETS`）。Cloudflare 真实 `Env`（R2/Workflow/Fetcher）与 Node 版 env 都结构满足它。`worker.ts` 瘦身为 Cloudflare 专属壳（透传绑定 + 导出 `IngestWorkflow`）。一份路由，两个入口复用。
- **Node 入口 `src/server.ts`**：自带一个**零依赖**的 `node:http ↔ Web fetch` 适配器（`IncomingMessage→Request`、`Response→ServerResponse` 流式写回，支持 SSE）。不引框架——曾试 `@whatwg-node/server`，其类型里的 `/// <reference lib="dom" />` 会把 DOM lib 注入全编译、覆盖项目刻意设的 `lib:["ES2022"]` 并连带打挂 `ocr.ts`，故弃用、手写适配器（也回到旧 `src/web.ts` 的 node:http 形态）。
- **R2 → 本地 fs**：`src/lib/fs-bucket.ts` 实现 `AppEnv.BUCKET`（put/get 落 `${DATA_DIR}/<key>`，结构对齐 R2，含目录穿越防护）。OCR 缓存复用 `fsOcrCache(baseDir)`（加了 baseDir 参数指向卷）。PDF 原件、入库进度 JSON 都落 `${DATA_DIR}`。
- **Workflow → 进程内串行队列**：`src/lib/ingest-runner.ts` 实现 `AppEnv.INGEST_WORKFLOW`，用一条 promise 链串行跑入库任务（避免两个 OCR+embed 同时压垮小机器），复用 `ingest-pipeline` 的 `cachedOcrPages/chunkPages/ensureTable/upsertRecords`，进度经 BUCKET shim 写 `ingest_status/<id>.json`（与 Workflow 同形，故 `handleIngestStatus` 零改动）。
- **库连接**：fly.io 设 `VECTOR_DB_URL=file:/data/vector.db`、**不设** `TURSO_*`，命中 `openrouter.ts` 既有回退，零改代码。`@libsql/client/web` 别名只对 Workers 构建生效，Node 入口自然用原生客户端（支持 `file:`）。
- **容器化**：`Dockerfile`（`node:22-bookworm-slim`，glibc——alpine 的 musl 装不上 libsql 原生绑定；多阶段 builder 构建前端、runner 只装生产依赖；tsx 直跑 TS）。`docker-entrypoint.sh` 首启把镜像内 `/app/seed/vector.db` 拷到卷（卷持久、重部署不覆盖）。`fly.toml`：挂卷 `/data`、内存 1G、`auto_stop_machines=false` + `min_machines_running=1`（防缩容杀在途入库）。
- **种子库**：[ADR-0009](0009-drop-vector-index-bruteforce.md) 去掉 DiskANN 后，旧 595M 本地库的膨胀大头（索引 shadow 表）`VACUUM` 删不掉，故**用新代码本地重灌**出 ~19M 无索引库再烤进镜像，而非搬旧库。

## 代价 / 已知风险

- **单卷无副本**：fly volume 单宿主机，需配快照备份（`fly volumes snapshots`）或定时 `sqlite3 .backup` 推走。
- **进程重启丢在途入库**：状态文件会停在 `embed`；单 admin、偶发入库，可接受（server 启动可标记 error 提示重传）。
- **双轨维护成本**：两个入口、两套对象存储/任务实现；但路由已收口 `app.ts`，分叉面很小。
- **OCR 拉百度 BCE**：Node 有 IPv4 hack（`ocr.ts`），fly.io 上应正常，首次入库重点观察。

详见 [docs/部署-fly.md](../部署-fly.md)。
