// 读取 libSQL 里已入库的全部块（text + 元数据），供 BM25 关键词召回用。
// LibSQLVector 没有「列出全部」的 public API，直接读其存储表（standards）：
// 列 vector_id = 块 id，metadata = 入库时写的 JSON（含 text 与中文元数据字段）。
// 进程内缓存：同一次运行只读一次库。集成/IO，不做 TDD。

import { createClient } from '@libsql/client'
import { VECTOR_DB_URL, VECTOR_DB_AUTH_TOKEN, INDEX_NAME } from './openrouter.js'
import type { ChunkMeta } from './hybrid.js'

export interface CorpusChunk {
  id: string
  text: string
  metadata: ChunkMeta
}

let cache: Promise<CorpusChunk[]> | undefined

export function loadCorpus(): Promise<CorpusChunk[]> {
  if (!cache) cache = fetchCorpus()
  return cache
}

/** 不走缓存，直读最新库（供资料库列表 /api/library 用：入库后无须重启即反映新标准）。 */
export function loadCorpusFresh(): Promise<CorpusChunk[]> {
  return fetchCorpus()
}

async function fetchCorpus(): Promise<CorpusChunk[]> {
  const client = createClient({ url: VECTOR_DB_URL, authToken: VECTOR_DB_AUTH_TOKEN })
  const res = await client.execute(`SELECT vector_id, metadata FROM ${INDEX_NAME}`)
  return res.rows.map((r) => {
    const metadata = JSON.parse(r.metadata as string) as ChunkMeta & { text?: string }
    return { id: r.vector_id as string, text: metadata.text ?? '', metadata }
  })
}

/**
 * 向量召回：`vector_distance_cos` 全表线性扫，返回按相似度升序的 top-K vector_id。
 * 本库规模（~1700 向量）下，去 DiskANN 索引改暴力扫——实测 ~10ms、结果与 vector_top_k 逐条一致，
 * 且免索引存储膨胀 / 远程逐条建图的写入慢（见调研）。规模涨到 ~10万+ 再加回 ANN 索引。
 */
export async function vectorSearchIds(queryVector: number[], topK: number): Promise<string[]> {
  const client = createClient({ url: VECTOR_DB_URL, authToken: VECTOR_DB_AUTH_TOKEN })
  const res = await client.execute({
    sql: `SELECT vector_id FROM ${INDEX_NAME}
          ORDER BY vector_distance_cos(embedding, vector32(?)) LIMIT ?`,
    args: [JSON.stringify(queryVector), topK],
  })
  return res.rows.map((r) => r.vector_id as string)
}
