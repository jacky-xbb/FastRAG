import { describe, it, expect } from 'vitest'
import { hasDeprecatedNotice } from '../src/lib/answer.js'

describe('hasDeprecatedNotice', () => {
  it('命中「已作废」时返回 true（用于界面加红标）', () => {
    expect(hasDeprecatedNotice('该标准已作废，拉伸强度 S型≥7.0 MPa。来源：JC/T 684-1997（第4页）')).toBe(true)
  })

  it('命中「作废」/「废止」也算（Agent 措辞不一）', () => {
    expect(hasDeprecatedNotice('注意：JC 684-1997 已废止。')).toBe(true)
    expect(hasDeprecatedNotice('该标准已于后续版本作废。')).toBe(true)
  })

  it('现行标准答案不加标', () => {
    expect(hasDeprecatedNotice('I 型卷材可溶物含量 ≥ 2900 g/m²。来源：GB/T 18242-2025（第7页）')).toBe(false)
  })

  it('空串安全返回 false', () => {
    expect(hasDeprecatedNotice('')).toBe(false)
  })
})
