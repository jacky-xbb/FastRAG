// BM25 关键词检索（ADR-0004 硬约束②：检索 = 向量 + BM25/全文 混合）。
// 指标块是「中文锚点 + 裸数字/拉丁」混排，稠密向量对精确数字/格子查找天生弱，
// 靠 BM25 补关键词召回。中文无词边界：CJK 连续段切相邻二元（bigram），
// ASCII 字母数字整段成词。纯函数，可单测。

export interface Doc {
  id: string
  text: string
}

/**
 * 分词：ASCII 按「字母段 / 数字段」各自成词（小写），故 jc684→jc,684、328.18→328,18，
 * 与库里空格分隔的「JC 684-1997」对得上；CJK 连续段切相邻二元，单字段保留单字。
 */
export function tokenize(text: string): string[] {
  const tokens: string[] = []
  for (const m of text.toLowerCase().matchAll(/[a-z]+|[0-9]+/g)) tokens.push(m[0])
  for (const m of text.matchAll(/[㐀-鿿]+/g)) {
    const run = m[0]
    if (run.length === 1) {
      tokens.push(run)
      continue
    }
    for (let i = 0; i < run.length - 1; i++) tokens.push(run[i] + run[i + 1])
  }
  return tokens
}

export interface Bm25Index {
  docs: { id: string; tf: Map<string, number>; len: number }[]
  df: Map<string, number>
  avgdl: number
  n: number
}

export function buildBm25(docs: Doc[]): Bm25Index {
  const df = new Map<string, number>()
  const built = docs.map((d) => {
    const tf = new Map<string, number>()
    const toks = tokenize(d.text)
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1)
    for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1)
    return { id: d.id, tf, len: toks.length }
  })
  const totalLen = built.reduce((s, d) => s + d.len, 0)
  return { docs: built, df, avgdl: totalLen / (built.length || 1), n: built.length }
}

const K1 = 1.5
const B = 0.75

/** 标准 BM25 打分，返回得分 > 0 的块按分降序，截到 topK。 */
export function bm25Search(
  index: Bm25Index,
  query: string,
  topK: number,
): { id: string; score: number }[] {
  const qTokens = [...new Set(tokenize(query))]
  const scored: { id: string; score: number }[] = []
  for (const doc of index.docs) {
    let score = 0
    for (const t of qTokens) {
      const tf = doc.tf.get(t)
      if (!tf) continue
      const df = index.df.get(t) ?? 0
      const idf = Math.log(1 + (index.n - df + 0.5) / (df + 0.5))
      const denom = tf + K1 * (1 - B + (B * doc.len) / index.avgdl)
      score += idf * ((tf * (K1 + 1)) / denom)
    }
    if (score > 0) scored.push({ id: doc.id, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK)
}
