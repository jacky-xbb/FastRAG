// Mastra 实例：libSQL 向量库 + 国标问答 Agent + 向量检索工具。
// 对话与 embedding 均走 OpenRouter（ADR-0001）。

import { Mastra } from '@mastra/core'
import { Agent } from '@mastra/core/agent'
import { createTool } from '@mastra/core/tools'
import { LibSQLVector, LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'
import { z } from 'zod'
import { chatModel, VECTOR_DB_URL } from '../lib/openrouter.js'
import { tavilySearch } from '../lib/tavily.js'
import { hybridSearch } from '../lib/retrieve.js'
import { formatHits } from '../lib/hybrid.js'

export const libsqlVector = new LibSQLVector({ id: 'libsql', url: VECTOR_DB_URL })

// 会话历史与向量库共用同一个 libSQL 文件（#5）：两者表名不冲突，可共存。
export const libsqlStore = new LibSQLStore({ id: 'libsql-store', url: VECTOR_DB_URL })

// 多轮会话历史：默认带最近 10 条消息（semanticRecall 关闭，无需额外向量库）。
export const memory = new Memory({ storage: libsqlStore })

// 混合检索工具（#4，硬约束②③）：向量 + BM25 关键词 + 元数据过滤，非纯向量。
// 元数据过滤在内存里做（中文 key 在 libSQL filter 会报错）。
// Agent 可填 {标准号,表名,指标名,页码} 收窄；过滤命中为空时 hybridSearch 自动回退
// 无过滤检索（防把标准号/表名猜错导致空答），靠混合召回保底。
// 标准号归一化匹配（jc684↔「JC 684-1997」），故模型用紧凑写法也能对上。
export const hybridQueryTool = createTool({
  id: 'hybridQueryTool',
  description:
    '在已入库国标中做混合检索（向量 + BM25 关键词 + 元数据过滤）。回答前先调它，库内优先。返回每个命中块的原文与「标准号+表名+页码」。可选填标准号/表名/指标名/页码收窄检索。',
  inputSchema: z.object({
    query: z.string().describe('检索问题或关键词（标准号、指标名、数值都可作关键词）'),
    topK: z.number().optional().describe('返回条数，默认 6'),
    standardCode: z.string().optional().describe('按标准号收窄，如「GB/T 23457」「jc684」，写法不一也能匹配'),
    table: z.string().optional().describe('按表名收窄，如「表2」'),
    indicator: z.string().optional().describe('按指标名收窄，如「拉伸性能」'),
    page: z.number().optional().describe('按页码收窄'),
  }),
  execute: async ({ query, topK, standardCode, table, indicator, page }) => {
    const hits = await hybridSearch(libsqlVector, {
      query,
      topK,
      filter: { 标准号: standardCode, 表名: table, 指标名: indicator, 页码: page },
    })
    return formatHits(hits)
  },
})

// 联网兜底工具（#6）：仅在库内检索不到时调用，结果自带「联网来源」标记。
export const webSearchTool = createTool({
  id: 'webSearchTool',
  description:
    '联网搜索兜底。仅当 hybridQueryTool 在已入库国标中找不到答案时才调用；返回结果均为「联网来源」，不可与国标库来源混淆。',
  inputSchema: z.object({
    query: z.string().describe('要联网搜索的查询词'),
  }),
  execute: async ({ query }) => {
    return await tavilySearch(query)
  },
})

export const standardsAgent = new Agent({
  id: 'standardsAgent',
  name: '国标问答',
  instructions: `你是防水卷材国标/行标问答助手。回答必须基于检索到的标准原文。

规则：
- 每次回答前，先用 hybridQueryTool 检索相关标准内容（库内优先）。指标类提问可带 standardCode/table/indicator/page 收窄精度。
- 答案必须标注来源：引用检索结果里的「标准号 + 页码」（如「来源：GB/T 18242-2025（第 3 页）」）。
- 仅当 hybridQueryTool 在已入库标准中找不到答案时，才调用 webSearchTool 联网兜底；库内已能回答就不要联网。
- 区分来源渠道：库内内容标注「来源：国标库」并附文件名+页码；联网内容标注「来源：联网」并附网页链接。两类来源不可混淆。
- 库内与联网都查不到时，如实说明未找到，不要编造数字。
- 用中文回答。`,
  model: chatModel,
  tools: { hybridQueryTool, webSearchTool },
  memory,
})

// 宽口径问题（如「有哪些性能要求」）会跨多张表多次检索，generate 默认 5 步常被截断成空答案；
// 放宽到 12 步，给模型留出检索后生成最终回答的余地。各调用点（web/ask）显式带上。
export const GENERATE_MAX_STEPS = 12

export const mastra = new Mastra({
  agents: { standardsAgent },
  vectors: { libsql: libsqlVector },
  storage: libsqlStore,
})
