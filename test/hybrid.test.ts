import { describe, it, expect } from 'vitest'
import {
  rrfFuse,
  matchesFilter,
  formatHits,
  expandSynonyms,
  matchKnownCode,
} from '../src/lib/hybrid.js'

const CODES = ['GB/T 18242-2025', 'GB/T 23457-2017', 'JC 684-1997', 'TB/T 2965-2018', 'GB/T 328.27-2007']

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

describe('matchKnownCode', () => {
  it('识别紧凑/完整标准号写法', () => {
    expect(matchKnownCode('jc684 的卷材不渗水能力？', CODES)).toBe('JC 684-1997')
    expect(matchKnownCode('GB/T 18242-2025 可溶物含量', CODES)).toBe('GB/T 18242-2025')
    expect(matchKnownCode('GB/T 328.27 取样规则', CODES)).toBe('GB/T 328.27-2007') // 不误抓其它 328.x
  })

  it('无编号 / 歧义返回 undefined', () => {
    expect(matchKnownCode('自粘防水卷材的可溶物含量', CODES)).toBeUndefined() // 无编号片段
    expect(matchKnownCode('防水卷材拉伸强度', CODES)).toBeUndefined()
  })
})

describe('expandSynonyms', () => {
  it('口语同义词扩展出标准术语并追加', () => {
    expect(expandSynonyms('卷材防水（不渗水）能力要求？')).toBe('卷材防水（不渗水）能力要求？ 不透水性')
    expect(expandSynonyms('耐高温多少度？')).toBe('耐高温多少度？ 耐热性')
  })

  it('已含标准术语 / 无同义词时原样返回', () => {
    expect(expandSynonyms('不透水性要求？')).toBe('不透水性要求？') // 已含标准词，不重复追加
    expect(expandSynonyms('拉伸强度多少？')).toBe('拉伸强度多少？') // 无同义词
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
