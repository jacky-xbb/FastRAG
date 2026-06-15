// --all 入库前的「预演计划」：纯逻辑把每份 PDF 分类成 cached / paid-ocr，
// 让 paid-ocr（真扣费）在动手前一目了然，避免无授权批量扣费（#3 的核心顾虑）。
// 全部 PDF 统一走 OCR（含 18242——其文字层错码严重、切不出指标行，见 ADR-0003）。

export type IngestMode = 'cached' | 'paid-ocr'

export interface IngestPlanItem {
  file: string
  mode: IngestMode
}

/** 按「已有 OCR 缓存 / 需付费 OCR」给每份 PDF 归类，保持入参顺序。 */
export function planIngest(
  files: string[],
  opts: { cachedFiles: Set<string> },
): IngestPlanItem[] {
  return files.map((file) => {
    const mode: IngestMode = opts.cachedFiles.has(file) ? 'cached' : 'paid-ocr'
    return { file, mode }
  })
}

/** 按模式计数；只有 paid-ocr 会真触发付费 OCR。 */
export function summarizePlan(plan: IngestPlanItem[]): Record<IngestMode | 'total', number> {
  const counts = { cached: 0, 'paid-ocr': 0, total: plan.length }
  for (const { mode } of plan) counts[mode]++
  return counts
}
