// 混合检索的纯逻辑（ADR-0004 硬约束②③）：
// RRF 融合多路召回 + 元数据过滤 + 命中结果格式化。
// 元数据用中文 key，libSQL 的 filter 解析不了中文 key（会报 Invalid field key），
// 故过滤在内存里做，绕开这个 bug。纯函数，可单测。

export interface ChunkMeta {
  标准号: string
  表名: string
  指标名: string
  页码: number
  状态: string
  [k: string]: unknown
}

export interface ChunkFilter {
  标准号?: string
  表名?: string
  指标名?: string
  页码?: number
}

/** Reciprocal Rank Fusion：多路排名按 1/(k+rank) 累加重排，k=60 为常用默认。 */
export function rrfFuse(rankings: string[][], k = 60): { id: string; score: number }[] {
  const scores = new Map<string, number>()
  for (const ranking of rankings) {
    ranking.forEach((id, i) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + i + 1))
    })
  }
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score)
}

/** 归一化：小写 + 去掉空格/标点等非字母数字与非中文字符。
 *  让「jc684」对上库里「JC 684-1997」、「GB/T 23457」对上「GB/T 23457-2017」。 */
export function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9一-鿿]/g, '')
}

/** 元数据过滤：页码按数值精确；字符串字段归一化后大小写/标点无关子串匹配。 */
export function matchesFilter(meta: ChunkMeta, filter: ChunkFilter): boolean {
  for (const [key, want] of Object.entries(filter)) {
    if (want == null || want === '') continue
    const got = meta[key]
    if (typeof want === 'number') {
      if (got !== want) return false
    } else if (!norm(String(got ?? '')).includes(norm(String(want)))) {
      return false
    }
  }
  return true
}

/** 口语/同义词 → 标准指标名。指标行用标准术语（如「不透水性」），用户常说口语（「不渗水」），
 *  BM25 词面对不上、向量也未必抓得住。保守、特异，避免无差别扩展引入噪声。 */
const SYNONYMS: ReadonlyArray<readonly [string, string]> = [
  ['不渗水', '不透水性'],
  ['不漏水', '不透水性'],
  ['耐高温', '耐热性'],
  ['低温抗裂', '低温柔性'],
]

/** 把 query 里的口语同义词扩展出对应标准术语并追加到 query 末尾（原词保留，只补缺失的标准词）。
 *  让 BM25/向量都能命中用标准术语命名的目标指标行。 */
export function expandSynonyms(query: string): string {
  const q = norm(query)
  const extra: string[] = []
  for (const [alias, canonical] of SYNONYMS) {
    if (q.includes(norm(alias)) && !q.includes(norm(canonical)) && !extra.includes(canonical)) {
      extra.push(canonical)
    }
  }
  return extra.length ? `${query} ${extra.join(' ')}` : query
}

/** 从 query 里识别用户写的标准号（含紧凑写法 jc684 → JC 684-1997）。
 *  对照库内真实标准号集合做归一化前缀匹配，避免脆弱正则乱抓；唯一命中才返回（歧义不锁）。 */
export function matchKnownCode(query: string, knownCodes: readonly string[]): string | undefined {
  // norm 后形如「字母+数字」的片段：gbt182422025 / jc684 / tbt2965。
  const frags = norm(query).match(/[a-z]+\d{3,}/g) ?? []
  if (frags.length === 0) return undefined
  const hits = new Set<string>()
  for (const code of knownCodes) {
    const nc = norm(code)
    if (frags.some((f) => nc.startsWith(f))) hits.add(code)
  }
  return hits.size === 1 ? [...hits][0] : undefined
}

/** 把命中块整理成给 Agent 读的文本：每条带来源锚点。 */
export function formatHits(hits: { text: string; metadata: ChunkMeta }[]): string {
  if (hits.length === 0) return '【国标库】未检索到相关内容。'
  const lines = ['【国标库检索结果 · 国标库来源】']
  hits.forEach((h, i) => {
    const m = h.metadata
    const where = `${m.标准号}｜${m.表名 || '正文'}｜第 ${m.页码} 页`
    lines.push(`${i + 1}. [${where}]\n${h.text}`)
  })
  return lines.join('\n\n')
}
