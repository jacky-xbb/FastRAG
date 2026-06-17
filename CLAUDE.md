# CLAUDE.md — 防水卷材国标问答知识库

问答知识库：导入防水卷材类国标/行标 PDF，检索并对话作答，保留会话历史，必要时联网兜底。技术栈 Mastra(TS) + libSQL。部署在 **Cloudflare Workers**（前端 assets + API fetch handler + 入库 Workflow），libSQL 用 **Turso** 托管；本地开发 `wrangler dev` + vite，本地 CLI 入库（`npm run ingest`）作兜底。部署/迁移见 [ADR-0008](docs/adr/0008-deploy-cloudflare-turso.md) 与 [docs/部署-cloudflare.md](docs/部署-cloudflare.md)。**另有 fly.io 部署路径**（常驻 Node 进程 `src/server.ts` + 本地卷 libSQL，与 Cloudflare 双轨并存；路由共享 `src/app.ts`）见 [ADR-0010](docs/adr/0010-deploy-fly-local-volume.md) 与 [docs/部署-fly.md](docs/部署-fly.md)。术语见 [CONTEXT.md](CONTEXT.md)，调研全貌见 [docs/调研文档.md](docs/调研文档.md)。

## 硬约束（写代码必须遵守）

1. **指标表格按「指标行」切块**，别整块嵌入 HTML 表。每块前缀 `标准号 + 产品名 + 表名 + 指标名` 作语义锚点（产品名从文件名提取，让用户用产品名问也召得回，免手工映射表）。（[ADR-0004](docs/adr/0004-indicator-chunking-hybrid-retrieval.md)）
2. **检索 = 向量 + BM25/全文 混合 + 元数据过滤**（`{标准号, 表名, 指标名, 页码}`），不是纯向量。
3. **入库与检索用同一个 embedding 模型**（向量空间一致），锁 `text-embedding-3-small`，别纠结升级。
4. **LLM 全收口 OpenRouter**：对话 `deepseek/deepseek-v4-flash` + embedding `openai/text-embedding-3-small`，显式建 OpenRouter provider（默认会直连官方 OpenAI）。embedding 锁死不动（向量空间一致）。（[ADR-0001](docs/adr/0001-model-routing-split.md)、调研文档 §11）
5. **OCR 走 PaddleOCR-VL-1.6 托管 API**，直接吃 PDF，不本地渲染、不引 Python。（[ADR-0003](docs/adr/0003-ocr-paddleocr-vl.md)）
6. 入库务必保留 `文件名 + 页码` 元数据，答案要能标来源。

> 注：废止标准（如 jc 684-1997）当**普通文档**处理——照常入库、检索、作答，不再特殊标注「已作废」。`状态` 字段仍入库（数据事实），但检索与作答不再据它做特殊行为。（[ADR-0005](docs/adr/0005-deprecated-as-normal.md)）

## key（.env，全大写）

`OPENROUTER_API_KEY`（LLM）、`PADDLE_API_KEY`（OCR）、`TAVILY_API_KEY`（联网）、`TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`（libSQL 库地址/鉴权，不填则回退本地 `file:./vector.db`）、`ADMIN_USER`/`ADMIN_PASSWORD`/`SESSION_SECRET`（鉴权）。embedding 不再单连 OpenAI。线上这些走 Workers secrets（`wrangler secret put`）。

## 文档分工

- `CONTEXT.md`：术语表，**只放领域名词，不放实现细节**。
- `docs/adr/`：架构决策记录。改了选型先看/补 ADR。
- `docs/调研文档.md`：一次性调研，别往里塞会绑定实现的硬决策（放这儿没人会读到）。

## 前端约定（软）

前端新增 UI 先看 [AI Elements](https://elements.ai-sdk.dev/) 有没有现成组件，有就 `npx ai-elements add <名>` 装进来复用，没有再自建。组件落在 `ui/src/components/ai-elements/`。

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues (`jacky-xbb/fastrag`), managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical triage roles, each mapped to its default label string. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
