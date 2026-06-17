// 扫描件 OCR：PaddleOCR-VL-1.6 托管 API（ADR-0003）。
// 直接上传 PDF 拿 markdown，不本地渲染、不引 Python。
// 用 Node 全局 fetch 直连 REST API（Simplicity First），流程对齐 docs/research/ocr_compare/paddle_vl_ocr.py：
//   提交 job → 轮询到 done → 拉 jsonl 结果 → 逐页 markdown。
// 指标表格在 markdown 里以带 rowspan/colspan 的 HTML 表格保留，合并单元格不丢。

import type { PageText } from './chunk.js'

const JOB_URL = 'https://paddleocr.aistudio-app.com/api/v2/ocr/jobs'
const MODEL = 'PaddleOCR-VL-1.6'

// 扫描件不需要方向分类/去扭曲/图表识别，关掉省时。
const OPTIONAL_PAYLOAD = {
  useDocOrientationClassify: false,
  useDocUnwarping: false,
  useChartRecognition: false,
}

/** 解析 PaddleOCR-VL 返回的 JSONL，逐页返回 markdown 文本（顺序即页序）。纯函数，可单测。 */
export function parsePaddleJsonl(jsonl: string): string[] {
  const pages: string[] = []
  for (const line of jsonl.trim().split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const { result } = JSON.parse(trimmed) as {
      result: { layoutParsingResults: { markdown: { text: string } }[] }
    }
    for (const res of result.layoutParsingResults) {
      pages.push(res.markdown.text)
    }
  }
  return pages
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** 提交 PDF 给 PaddleOCR-VL，返回 jobId。 */
async function submitJob(pdfBytes: Uint8Array, fileName: string, apiKey: string): Promise<string> {
  const form = new FormData()
  form.append('model', MODEL)
  form.append('optionalPayload', JSON.stringify(OPTIONAL_PAYLOAD))
  form.append('file', new Blob([pdfBytes]), fileName)

  const res = await fetch(JOB_URL, {
    method: 'POST',
    headers: { Authorization: `bearer ${apiKey}` },
    body: form,
  })
  if (!res.ok) {
    throw new Error(`PaddleOCR 提交失败：${res.status} ${await res.text()}`)
  }
  return ((await res.json()) as { data: { jobId: string } }).data.jobId
}

/** 轮询 job 直到 done，返回结果 jsonl 的下载地址。 */
async function pollJob(jobId: string, apiKey: string): Promise<string> {
  while (true) {
    const res = await fetch(`${JOB_URL}/${jobId}`, {
      headers: { Authorization: `bearer ${apiKey}` },
    })
    if (!res.ok) {
      throw new Error(`PaddleOCR 轮询失败：${res.status} ${await res.text()}`)
    }
    const { data } = (await res.json()) as {
      data: {
        state: string
        errorMsg?: string
        extractProgress?: { extractedPages?: number; totalPages?: number }
        resultUrl?: { jsonUrl: string }
      }
    }

    if (data.state === 'done') {
      console.log(`[ocr] 完成，共 ${data.extractProgress?.extractedPages ?? '?'} 页`)
      return data.resultUrl!.jsonUrl
    }
    if (data.state === 'failed') {
      throw new Error(`PaddleOCR 处理失败：${data.errorMsg}`)
    }
    const prog = data.extractProgress
    console.log(
      `[ocr] ${data.state}${prog ? ` ${prog.extractedPages ?? '?'}/${prog.totalPages ?? '?'} 页` : ''}`,
    )
    await sleep(5000)
  }
}

// 结果托管在百度 BCE（bcebos.com）：其 IPv6 地址在 Node 本机不可达，而 Node fetch 默认
// 优先试 IPv6 且不回退，直接 ETIMEDOUT。强制走 IPv4 才能拉到结果。
// Workers 运行时无 node:dns/node:net 这两个 API（且 fetch 由 CF 边缘代连），故 guarded：
// Node 下生效；Workers 下 import 失败/函数缺失即静默跳过（边缘连通性见迁移文档风险①）。
async function preferIPv4(): Promise<void> {
  try {
    const dns = await import('node:dns')
    const net = await import('node:net')
    dns.setDefaultResultOrder?.('ipv4first')
    net.setDefaultAutoSelectFamily?.(false)
  } catch {
    /* Workers：no-op */
  }
}

/**
 * 把扫描件 PDF（字节）经 PaddleOCR-VL 转成逐页 markdown，对齐入库格式（PageText[]）。
 * 吃字节而非路径，本地（fs 读盘）与 Workers（R2 取对象）两条路都能复用。
 * 网络调用，不做 TDD；集成时手测。
 */
export async function ocrPdfToPages(pdfBytes: Uint8Array, fileName: string): Promise<PageText[]> {
  const apiKey = process.env.PADDLE_API_KEY
  if (!apiKey) {
    throw new Error('缺少 PADDLE_API_KEY（见 .env.example）')
  }

  await preferIPv4()

  console.log(`[ocr] 提交 ${fileName} 给 PaddleOCR-VL...`)
  const jobId = await submitJob(pdfBytes, fileName, apiKey)
  console.log(`[ocr] jobId=${jobId}，轮询中...`)
  const jsonUrl = await pollJob(jobId, apiKey)
  console.log(`[ocr] 拉取结果：${jsonUrl}`)

  const jr = await fetch(jsonUrl)
  if (!jr.ok) {
    throw new Error(`PaddleOCR 拉取结果失败：${jr.status}`)
  }
  const pagesMd = parsePaddleJsonl(await jr.text())

  // 页码从 1 开始；保留文件名 + 页码作来源锚点（对齐 #1 入库格式）。
  return pagesMd.map((text, i) => ({ page: i + 1, text }))
}
