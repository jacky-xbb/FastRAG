// 示例数据 —— 后端暂未暴露「PDF 库列表 / 历史会话列表」HTTP 接口，先用示例数据撑布局。
// 对话是真的（走 /api/chat）；这两块是示例。
// TODO(接后端)：MOCK_LIBRARY → GET /api/library；MOCK_SESSIONS → GET /api/threads + /api/messages。

export interface PdfDoc {
  id: string
  /** 文件名（产品名锚点从这里来，见 ADR-0004） */
  name: string
  code: string
  pages: number
  chunks: number
  status: '已入库' | '处理中' | '废止'
  ingestedAt: string
}

export const MOCK_LIBRARY: PdfDoc[] = [
  { id: '1', name: 'GBT 18242-2025 弹性体改性沥青防水卷材', code: 'GB/T 18242-2025', pages: 12, chunks: 86, status: '已入库', ingestedAt: '2026-05-30' },
  { id: '2', name: 'GBT 23457-2017 预铺防水卷材', code: 'GB/T 23457-2017', pages: 16, chunks: 104, status: '已入库', ingestedAt: '2026-05-30' },
  { id: '3', name: 'GBT 328 建筑防水卷材试验方法', code: 'GB/T 328', pages: 40, chunks: 312, status: '已入库', ingestedAt: '2026-06-02' },
  { id: '4', name: 'JC_T 684-1997 氯化聚乙烯防水卷材', code: 'JC/T 684-1997', pages: 8, chunks: 51, status: '废止', ingestedAt: '2026-06-08' },
  { id: '5', name: 'TB_T 3360 铁路混凝土桥面防水卷材', code: 'TB/T 3360', pages: 22, chunks: 173, status: '已入库', ingestedAt: '2026-06-11' },
]

export interface Session {
  id: string
  title: string
  snippet: string
  when: string
}

export const MOCK_SESSIONS: Session[] = [
  { id: 's1', title: 'I 型卷材可溶物含量', snippet: 'GBT 18242-2025 中 I 型卷材的可溶物含量要求是多少？', when: '今天 14:22' },
  { id: 's2', title: '预铺卷材搭接强度', snippet: 'GB/T 23457 的搭接缝剥离强度指标？', when: '今天 10:05' },
  { id: 's3', title: '低温柔性对比', snippet: '弹性体和塑性体改性沥青卷材低温柔性差别？', when: '昨天' },
  { id: 's4', title: '拉伸性能试验方法', snippet: 'GB/T 328 里拉力和延伸率怎么测？', when: '6 月 11 日' },
]

export const SUGGESTIONS = [
  'GBT 18242-2025 中 I 型卷材的可溶物含量要求是多少？',
  'GB/T 23457 预铺防水卷材的搭接缝剥离强度指标？',
  '弹性体改性沥青卷材的低温柔性要求是多少？',
  '防水卷材的拉伸性能怎么测？引用试验方法。',
]

// 上传向量化的真实管线阶段（对应 ingest.ts：OCR → 指标行切块 → embed → upsert）。
export const INGEST_STAGES = [
  { key: 'upload', label: '上传 PDF', detail: '读取文件字节' },
  { key: 'ocr', label: 'PaddleOCR-VL 识别', detail: '直接吃 PDF，拿干净 markdown 表格（ADR-0003）' },
  { key: 'chunk', label: '指标行切块', detail: '按指标行切，前缀「标准号+产品名+表名+指标名」锚点（ADR-0004）' },
  { key: 'embed', label: 'embedding 向量化', detail: 'text-embedding-3-small，批量 embedMany' },
  { key: 'upsert', label: 'upsert 到 libSQL', detail: '带 {标准号,表名,指标名,页码} 元数据落库' },
] as const
