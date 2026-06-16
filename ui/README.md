# ui —— 国标问答 Web 前端

专业暗色 · 三栏工作台（Vite + React + Tailwind v4）。三屏：**登录 → 导入 PDF 向量化 → 三栏对话（含右侧证据面板）**。

## 跑起来

```bash
npm install          # 首次
npm run dev          # 后端 API(:4111) + Vite(:5173) 一起起，开 http://localhost:5173
```

生产：

```bash
npm run ui:build     # 出 ui/dist
npm run web          # :4111 直接托管 ui/dist（同源，无需代理）
```

## 现状

- **对话 / 检索 / 联网兜底 / 多轮记忆**：真的，走 `/api/chat`（需 `.env` 的 `OPENROUTER_API_KEY` 且已 `npm run ingest` 入过库）。右侧证据面板实时显示 🔍库内/🌐联网检索轨迹，并自动从答案里抽「标准号 + 页码」当来源。
- **登录**：纯前端占位，随便填直接进（暂无真实鉴权）。
- **导入 PDF 向量化**：界面真，进度是按真实管线（OCR→指标行切块→embed→upsert）的**模拟动画**。
- **PDF 库列表 / 历史会话**：**示例数据**（`src/lib/mockData.ts`）。

## 待接后端（TODO）

| 前端 | 需要的后端接口 |
| --- | --- |
| 导入页真上传 | `POST /api/ingest`（multipart PDF，复用 `src/ingest.ts` 管线，SSE/轮询推阶段） |
| 历史列表真数据 | `GET /api/threads`、`GET /api/messages?threadId=`（读 libSQL memory） |
| 资料库真数据 | `GET /api/library`（已入库标准清单） |

接口补齐后，把 `useIngestSim` 换成真上传、`mockData` 换成 fetch 即可，组件不用大改。
