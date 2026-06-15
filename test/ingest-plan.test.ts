import { describe, it, expect } from 'vitest'
import { planIngest, summarizePlan } from '../src/lib/ingest-plan.js'

describe('planIngest', () => {
  it('缓存命中标 cached，其余标 paid-ocr', () => {
    const plan = planIngest(
      ['GBT 23457-2017 预铺防水卷材.pdf', 'GBT 35467-2017 湿铺防水卷材.pdf'],
      { cachedFiles: new Set(['GBT 23457-2017 预铺防水卷材.pdf']) },
    )
    expect(plan).toEqual([
      { file: 'GBT 23457-2017 预铺防水卷材.pdf', mode: 'cached' },
      { file: 'GBT 35467-2017 湿铺防水卷材.pdf', mode: 'paid-ocr' },
    ])
  })

  it('保持入参顺序', () => {
    const files = ['b.pdf', 'a.pdf']
    expect(planIngest(files, { cachedFiles: new Set() }).map((p) => p.file)).toEqual(files)
  })
})

describe('summarizePlan', () => {
  it('按模式计数，只有 paid-ocr 会真扣费', () => {
    const plan = planIngest(
      ['GBT 23457-2017 预铺防水卷材.pdf', 'a.pdf', 'b.pdf'],
      { cachedFiles: new Set(['GBT 23457-2017 预铺防水卷材.pdf']) },
    )
    expect(summarizePlan(plan)).toEqual({ cached: 1, 'paid-ocr': 2, total: 3 })
  })
})
