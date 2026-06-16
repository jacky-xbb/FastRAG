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

/** 入库与检索共用：libSQL 向量库文件 + 索引名 + 维度。
 *  VECTOR_DB_URL 可由环境变量覆盖，用于建独立的对比库（切法 A/B 实验），不碰现状 vector.db。 */
export const VECTOR_DB_URL = process.env.VECTOR_DB_URL ?? 'file:./vector.db'
export const INDEX_NAME = 'standards'
export const EMBED_DIMENSION = 1536
