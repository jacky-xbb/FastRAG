import { describe, it, expect } from 'vitest'
import { planIngest, summarizePlan } from '../src/lib/ingest-plan.js'

const TEXT_LAYER = 'GBT 18242-2025 弹性体塑性体改性沥青防水卷材.pdf'

describe('planIngest', () => {
  it('文字层 PDF 标 text-layer，缓存命中标 cached，其余标 paid-ocr', () => {
    const plan = planIngest(
      [TEXT_LAYER, 'GBT 23457-2017 预铺防水卷材.pdf', 'GBT 35467-2017 湿铺防水卷材.pdf'],
      { textLayerPdf: TEXT_LAYER, cachedFiles: new Set(['GBT 23457-2017 预铺防水卷材.pdf']) },
    )
    expect(plan).toEqual([
      { file: TEXT_LAYER, mode: 'text-layer' },
      { file: 'GBT 23457-2017 预铺防水卷材.pdf', mode: 'cached' },
      { file: 'GBT 35467-2017 湿铺防水卷材.pdf', mode: 'paid-ocr' },
    ])
  })

  it('保持入参顺序', () => {
    const files = ['b.pdf', 'a.pdf']
    expect(planIngest(files, { textLayerPdf: 'x', cachedFiles: new Set() }).map((p) => p.file)).toEqual(
      files,
    )
  })
})

describe('summarizePlan', () => {
  it('按模式计数，只有 paid-ocr 会真扣费', () => {
    const plan = planIngest(
      [TEXT_LAYER, 'GBT 23457-2017 预铺防水卷材.pdf', 'a.pdf', 'b.pdf'],
      { textLayerPdf: TEXT_LAYER, cachedFiles: new Set(['GBT 23457-2017 预铺防水卷材.pdf']) },
    )
    expect(summarizePlan(plan)).toEqual({ 'text-layer': 1, cached: 1, 'paid-ocr': 2, total: 4 })
  })
})
