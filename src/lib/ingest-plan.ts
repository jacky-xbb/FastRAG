// --all 入库前的「预演计划」：纯逻辑把每份 PDF 分类成 text-layer / cached / paid-ocr，
// 让 paid-ocr（真扣费）在动手前一目了然，避免无授权批量扣费（#3 的核心顾虑）。

export type IngestMode = 'text-layer' | 'cached' | 'paid-ocr'

export interface IngestPlanItem {
  file: string
  mode: IngestMode
}

/** 按「文字层标准 / 已有 OCR 缓存 / 需付费 OCR」给每份 PDF 归类，保持入参顺序。 */
export function planIngest(
  files: string[],
  opts: { textLayerPdf: string; cachedFiles: Set<string> },
): IngestPlanItem[] {
  return files.map((file) => {
    const mode: IngestMode =
      file === opts.textLayerPdf ? 'text-layer' : opts.cachedFiles.has(file) ? 'cached' : 'paid-ocr'
    return { file, mode }
  })
}

/** 按模式计数；只有 paid-ocr 会真触发付费 OCR。 */
export function summarizePlan(plan: IngestPlanItem[]): Record<IngestMode | 'total', number> {
  const counts = { 'text-layer': 0, cached: 0, 'paid-ocr': 0, total: plan.length }
  for (const { mode } of plan) counts[mode]++
  return counts
}
