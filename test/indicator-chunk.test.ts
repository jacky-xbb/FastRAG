import { describe, it, expect, beforeAll } from 'vitest'
import {
  normalizeCell,
  parseHtmlTable,
  standardCodeFromFileName,
  standardNameFromFileName,
  statusFromFileName,
  isReceiptNoise,
  chunkOcrPages,
} from '../src/lib/indicator-chunk.js'

describe('normalizeCell', () => {
  it('剥掉 $…$ 并把上标归一成 Unicode', () => {
    expect(normalizeCell('$ kg/m^{2} $')).toBe('kg/m²')
    // 源串括号内本就带空格，剥 $ 后保留；上标/比较符归一即可
    expect(normalizeCell('( $ g/m^{{3}} $) \\ge')).toBe('( g/m³ ) ≥')
  })

  it('LaTeX 比较符转符号', () => {
    expect(normalizeCell('拉力/(N/50 mm) \\ge')).toBe('拉力/(N/50 mm) ≥')
    expect(normalizeCell('\\le 0.5')).toBe('≤ 0.5')
  })

  it('清掉转义换行并合并空白', () => {
    expect(normalizeCell('0.3 MPa,\\n120 min\\n不透水')).toBe('0.3 MPa, 120 min 不透水')
    expect(normalizeCell('项   目')).toBe('项 目')
  })

  it('剥掉残留 HTML 标签', () => {
    expect(normalizeCell('<td>4.1</td>')).toBe('4.1')
  })
})

describe('parseHtmlTable（rowspan/colspan 展开）', () => {
  const table1 =
    `<table border=1><tr><td colspan="2">项 目</td><td>指 标</td></tr>` +
    `<tr><td>单位面积质量/ $ kg/m^{2} $</td><td>≥</td><td>4.1</td></tr>` +
    `<tr><td rowspan="2">厚度/mm</td><td>平均值 ≥</td><td>4.0</td></tr>` +
    `<tr><td>最小单值 ≥</td><td>3.7</td></tr></table>`

  it('colspan 把单元格横向铺开', () => {
    const grid = parseHtmlTable(table1)
    expect(grid[0]).toEqual(['项 目', '项 目', '指 标'])
  })

  it('rowspan 把单元格纵向铺到下一行', () => {
    const grid = parseHtmlTable(table1)
    expect(grid[2]).toEqual(['厚度/mm', '平均值 ≥', '4.0'])
    expect(grid[3]).toEqual(['厚度/mm', '最小单值 ≥', '3.7'])
  })
})

// 真实样本：GBT 23457-2017 表2 产品物理力学性能（截自 ocr_out.md）。
const table2 =
  `<table border=1><tr><td rowspan="2">序号</td><td rowspan="2" colspan="2">项目</td><td colspan="3">指标</td></tr>` +
  `<tr><td>P</td><td>PY</td><td>R</td></tr>` +
  `<tr><td>1</td><td colspan="2">可溶物含量/( $ g/m^{{3}} $) \\ge</td><td>—</td><td>2 900</td><td>—</td></tr>` +
  `<tr><td rowspan="5">2</td><td rowspan="5">拉伸性能</td><td>拉力/(N/50 mm) \\ge</td><td>600</td><td>800</td><td>350</td></tr>` +
  `<tr><td>拉伸强度/MPa \\ge</td><td>16</td><td>—</td><td>9</td></tr></table>`

describe('chunkOcrPages（指标行切块）', () => {
  const pages = [
    {
      page: 7,
      text: `### 5.3 物理力学性能\n\n<div style="text-align: center;">表2 产品物理力学性能</div>\n\n${table2}`,
    },
  ]

  let records: Awaited<ReturnType<typeof chunkOcrPages>>
  beforeAll(async () => {
    records = await chunkOcrPages(pages, {
      fileName: 'GBT 23457-2017 预铺防水卷材.pdf',
      标准号: 'GB/T 23457-2017',
      状态: '现行',
      size: 800,
      overlap: 100,
    })
  })

  it('每个指标行单独成块，前缀含标准号 + 表名 + 指标名', () => {
    const 拉力 = records.find((r) => r.metadata.指标名.includes('拉力'))
    expect(拉力).toBeDefined()
    expect(拉力!.text).toContain('GB/T 23457-2017')
    expect(拉力!.text).toContain('表2 产品物理力学性能')
    expect(拉力!.text).toContain('拉力')
  })

  it('裸数字带着列头进块（P/PY/R）', () => {
    const 拉力 = records.find((r) => r.metadata.指标名.includes('拉力'))!
    expect(拉力.text).toContain('600')
    expect(拉力.text).toContain('800')
    expect(拉力.text).toContain('350')
    // 列头随值一起出现，数字不再裸奔
    expect(拉力.text).toMatch(/P[^Y].*600|600/)
  })

  it('多行合并指标（拉伸性能）的子行各自带上母项名', () => {
    const 拉伸强度 = records.find((r) => r.metadata.指标名.includes('拉伸强度'))!
    expect(拉伸强度.metadata.指标名).toContain('拉伸性能')
  })

  it('每块带全套元数据 {标准号,表名,指标名,页码,状态}', () => {
    const r = records[0]
    expect(r.metadata).toMatchObject({
      标准号: 'GB/T 23457-2017',
      表名: '表2 产品物理力学性能',
      页码: 7,
      状态: '现行',
      fileName: 'GBT 23457-2017 预铺防水卷材.pdf',
    })
    expect(r.metadata.指标名.length).toBeGreaterThan(0)
  })
})

describe('standardCodeFromFileName', () => {
  it.each([
    ['GBT 18242-2025 弹性体塑性体改性沥青防水卷材.pdf', 'GB/T 18242-2025'],
    ['GBT 328.18-2007 建筑防水卷材试验方法.pdf', 'GB/T 328.18-2007'],
    ['jc 684-1997 氯化聚乙烯——橡胶共混防水卷材-----作废.pdf', 'JC 684-1997'],
    ['JCT 974-2005 道桥用改性沥青防水卷材.pdf', 'JC/T 974-2005'],
    ['JT T536-2018路桥用塑性体改性沥青防水卷材 [高清版].pdf', 'JT/T 536-2018'],
    ['TBT2965-2018铁路桥梁混凝土桥面防水层.pdf', 'TB/T 2965-2018'],
    ['TBT3360.1-2023铁路隧道防排水材料第1部分-防水板和排水板.PDF', 'TB/T 3360.1-2023'],
  ])('%s → %s', (file, code) => {
    expect(standardCodeFromFileName(file)).toBe(code)
  })
})

describe('standardNameFromFileName', () => {
  it.each([
    ['GBT 18242-2025 弹性体塑性体改性沥青防水卷材.pdf', '弹性体塑性体改性沥青防水卷材'],
    ['jc 684-1997 氯化聚乙烯——橡胶共混防水卷材-----作废.pdf', '氯化聚乙烯橡胶共混防水卷材'],
    ['TBT2965-2018铁路桥梁混凝土桥面防水层.pdf', '铁路桥梁混凝土桥面防水层'],
  ])('%s → %s', (file, name) => {
    expect(standardNameFromFileName(file)).toBe(name)
  })
})

describe('chunkOcrPages 块前缀含产品名（治本：用户用产品名问也召得回）', () => {
  it('前缀加上从文件名提取的产品名', async () => {
    const recs = await chunkOcrPages(
      [{ page: 1, text: `<div>表2</div>${table2}` }],
      { fileName: 'GBT 23457-2017 自粘聚合物改性沥青防水卷材.pdf', 标准号: 'GB/T 23457-2017', size: 800, overlap: 100 },
    )
    const 拉力 = recs.find((r) => r.metadata.指标名.includes('拉力'))!
    expect(拉力.text).toContain('自粘聚合物改性沥青防水卷材')
  })
})

describe('isReceiptNoise', () => {
  it('购书小票/订单块判噪声', () => {
    expect(isReceiptNoise('零售单号：1040000004666 会员姓名：零售')).toBe(true)
    expect(isReceiptNoise('零售总数量：4 零售总码洋：40.00 零售总实洋：31.20')).toBe(true)
    expect(isReceiptNoise('总应收：31.20 折扣额：8.80')).toBe(true)
    expect(isReceiptNoise('零售备注：北京标科技行业标准图书')).toBe(true) // 「零售X」各种写法都抓
    expect(isReceiptNoise('书号 书名 出版社 仓号 价格 数量')).toBe(true)
  })

  it('标准技术正文/章节不误判', () => {
    expect(isReceiptNoise('第1部分：防水板和排水板（TB/T 3360.1—2023）')).toBe(false)
    expect(isReceiptNoise('拉力/(N/50 mm) ≥ 600 数量 价格')).toBe(false) // 含「数量价格」但非小票
  })
})

describe('statusFromFileName', () => {
  it('文件名含「作废」→ 废止', () => {
    expect(statusFromFileName('jc 684-1997 …作废.pdf')).toBe('废止')
  })
  it('其余 → 现行', () => {
    expect(statusFromFileName('GBT 18242-2025 ….pdf')).toBe('现行')
  })
})
