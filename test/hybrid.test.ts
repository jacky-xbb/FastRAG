import { describe, it, expect } from 'vitest'
import { rrfFuse, matchesFilter, formatHits, inferStandardCode } from '../src/lib/hybrid.js'

describe('rrfFuse', () => {
  it('两路都靠前的 id 融合后排第一', () => {
    const fused = rrfFuse([
      ['a', 'b', 'c'],
      ['b', 'a', 'd'],
    ])
    expect(fused[0].id).toBe('a')
    expect(fused.map((f) => f.id).sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('只在一路出现的 id 也保留', () => {
    const fused = rrfFuse([['x'], ['y']])
    expect(fused.map((f) => f.id).sort()).toEqual(['x', 'y'])
  })
})

const meta = (over: Partial<Record<string, unknown>> = {}) => ({
  标准号: 'GB/T 23457-2017',
  表名: '表2 产品物理力学性能',
  指标名: '可溶物含量',
  页码: 7,
  状态: '现行' as const,
  ...over,
})

describe('matchesFilter', () => {
  it('空过滤全通过', () => {
    expect(matchesFilter(meta(), {})).toBe(true)
  })

  it('字符串子串、页码数值精确', () => {
    expect(matchesFilter(meta(), { 标准号: '23457' })).toBe(true) // 子串
    expect(matchesFilter(meta(), { 页码: 7 })).toBe(true)
    expect(matchesFilter(meta(), { 页码: 8 })).toBe(false)
  })

  it('空串/undefined 字段当作不过滤', () => {
    expect(matchesFilter(meta(), { 标准号: '', 指标名: undefined })).toBe(true)
  })

  it('标准号归一化匹配：紧凑写法对上库里空格写法', () => {
    const m = meta({ 标准号: 'JC 684-1997' })
    expect(matchesFilter(m, { 标准号: 'jc684' })).toBe(true) // 去空格大小写无关
    expect(matchesFilter(m, { 标准号: 'JC684' })).toBe(true)
    expect(matchesFilter(m, { 标准号: 'GB' })).toBe(false) // 不沾边仍排除
  })
})

describe('inferStandardCode', () => {
  it('产品名/俗称映射到标准号（弥补块锚点缺产品名）', () => {
    expect(inferStandardCode('自粘防水卷材的可溶物含量要求？')).toBe('GB/T 23457')
    expect(inferStandardCode('SBS 防水卷材的耐热性试验温度？')).toBe('GB/T 18242')
    expect(inferStandardCode('氯化聚乙烯橡胶共混防水卷材的拉伸强度？')).toBe('JC 684')
  })

  it('同一标准的多个特异词共存仍唯一', () => {
    expect(inferStandardCode('SBS 弹性体改性沥青防水卷材的可溶物含量')).toBe('GB/T 18242')
  })

  it('无产品名 / 歧义（命中多个不同标准）返回 undefined', () => {
    expect(inferStandardCode('GB/T 23457 钉杆撕裂强度')).toBeUndefined() // 只有标准号，无产品名
    expect(inferStandardCode('防水卷材的拉伸强度')).toBeUndefined() // 泛词不映射
    expect(inferStandardCode('自粘和 SBS 卷材')).toBeUndefined() // 歧义
  })
})

describe('formatHits', () => {
  it('每条带标准号+表名+页码', () => {
    const out = formatHits([
      { text: '拉力 800', metadata: meta() },
      { text: '旧指标 350', metadata: meta({ 标准号: 'JC 684-1997' }) },
    ])
    expect(out).toContain('GB/T 23457-2017')
    expect(out).toContain('JC 684-1997')
    expect(out).toContain('第 7 页')
  })

  it('无命中给出明确提示', () => {
    expect(formatHits([])).toContain('未检索到')
  })
})
