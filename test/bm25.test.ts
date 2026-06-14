import { describe, it, expect } from 'vitest'
import { tokenize, buildBm25, bm25Search } from '../src/lib/bm25.js'

describe('tokenize', () => {
  it('ASCII 按字母段/数字段各自成词并小写', () => {
    expect(tokenize('PY=2 900 N/50mm')).toEqual(['py', '2', '900', 'n', '50', 'mm'])
  })

  it('字母数字粘连的标准号拆成字母段+数字段，对得上库里空格写法', () => {
    expect(tokenize('jc684')).toEqual(['jc', '684'])
    expect(tokenize('328.18')).toEqual(['328', '18'])
  })

  it('CJK 在连续段内切相邻二元', () => {
    expect(tokenize('可溶物含量')).toEqual(['可溶', '溶物', '物含', '含量'])
  })

  it('混排：CJK 二元 + ASCII 词分别成 token，不跨标点连字', () => {
    expect(tokenize('拉力（PY）')).toEqual(['py', '拉力'])
  })
})

describe('bm25Search', () => {
  const docs = [
    { id: 'a', text: 'GB/T 23457-2017 表2 / 可溶物含量 PY=2900' },
    { id: 'b', text: 'GB/T 18242-2025 表3 / 拉伸性能 拉力 800' },
    { id: 'c', text: 'GB/T 328.27 / 吸水性 试验方法' },
  ]

  it('含查询词的块排在前，不含的得 0 分被剔除', () => {
    const index = buildBm25(docs)
    const hits = bm25Search(index, '可溶物含量', 10)
    expect(hits[0].id).toBe('a')
    expect(hits.map((h) => h.id)).not.toContain('c')
  })

  it('裸数字也能作为关键词命中', () => {
    const index = buildBm25(docs)
    const hits = bm25Search(index, '2900', 10)
    expect(hits[0].id).toBe('a')
  })

  it('topK 截断返回条数', () => {
    const index = buildBm25(docs)
    expect(bm25Search(index, '表 性能 试验', 1).length).toBe(1)
  })
})
