// Cloudflare Worker 入口（Cloudflare 专属壳）：路由逻辑在 src/app.ts 共享，这里只负责
// 透传真实绑定（R2 BUCKET / Workflow / ASSETS 静态资源）并导出入库 Workflow 类供 wrangler 注册。
// Node/fly.io 入口见 src/server.ts。
import { dispatch, type AppEnv } from './app.js'

export { IngestWorkflow } from './ingest-workflow.js'

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    // 真实 Env（R2Bucket/Workflow/Fetcher）结构满足 app.ts 的 AppEnv，直接透传。
    return dispatch(req, env as unknown as AppEnv)
  },
}
