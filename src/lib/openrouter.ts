// 模型全收口 OpenRouter（ADR-0001）。
// 关键：直接写 'openai/...' 会被 AI SDK 当成官方 OpenAI 直连——
// 必须显式建 OpenRouter provider 再传模型实例。对话与 embedding 共用一个 key。

import { createOpenRouter } from '@openrouter/ai-sdk-provider'

if (!process.env.OPENROUTER_API_KEY) {
  throw new Error('缺少 OPENROUTER_API_KEY（见 .env.example）')
}

export const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
})

/** 对话模型：DeepSeek V4 Flash（ADR-0001）。
 * 「查表取数 + 标来源」用不上 gpt-5 的深推理；Flash 实测更快、检索次数更少、中文与废止标注都达标，
 * 成本约为 gpt-5 的 1/55。注意 DS V4 只支持 high/xhigh 两档 reasoning，没有 low，故不设 effort。 */
export const chatModel = openrouter.chat('deepseek/deepseek-v4-flash')

/** embedding 模型（1536 维）。入库与检索必须用同一个，否则向量空间对不上。 */
export const embedModel = openrouter.textEmbeddingModel('openai/text-embedding-3-small')

/** 入库与检索共用：libSQL 向量库地址 + 鉴权 token + 索引名 + 维度。
 *  DB_MODE=local：连本地 `turso dev`（http://127.0.0.1:8080，喂 vector.db）——
 *    wrangler dev 跑 workerd，libSQL 被 alias 成 web 版客户端，不支持 file:，故本地也得走 http。
 *    起本地库：`turso dev --db-file vector.db`（另开一个终端）。
 *  缺省 / DB_MODE=turso：连线上 Turso（TURSO_DATABASE_URL=libsql://… + TURSO_AUTH_TOKEN）。
 *  VECTOR_DB_URL 仍可覆盖（用于切法 A/B 对比库，node CLI 下也支持 file:）。 */
const LOCAL_DB = process.env.DB_MODE === 'local'
export const VECTOR_DB_URL = LOCAL_DB
  ? (process.env.VECTOR_DB_URL ?? 'http://127.0.0.1:8080')
  : (process.env.TURSO_DATABASE_URL ?? process.env.VECTOR_DB_URL ?? 'file:./vector.db')
export const VECTOR_DB_AUTH_TOKEN = LOCAL_DB ? undefined : process.env.TURSO_AUTH_TOKEN
export const INDEX_NAME = 'standards'
export const EMBED_DIMENSION = 1536
