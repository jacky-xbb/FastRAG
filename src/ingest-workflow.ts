// 入库长任务（OCR 轮询可达数分钟 + 分批 embed/upsert）走 Cloudflare Workflow：持久、可重试、
// 跨 step 自动续跑，不受单次 Worker 请求时长限制。复用 ingest-pipeline 的同一套管线（Workers-bundle 安全）。
// 进度逐 step 写到 R2（ingest_status/<id>.json），前端轮询 /api/ingest/status 读它。
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers'
import { cachedOcrPages, chunkPages, ensureTable, upsertRecords, type OcrCache } from './lib/ingest-pipeline.js'
import type { PageText } from './lib/chunk.js'

export interface IngestParams {
  fileName: string
  r2Key: string // PDF 原件在 R2 的 key
  statusKey: string // 进度 JSON 在 R2 的 key
}

/** R2 实现的 OcrCache（本地 CLI 用 fs 版，见 ocr-cache-fs.ts）。 */
function r2OcrCache(bucket: R2Bucket): OcrCache {
  return {
    async get(fileName) {
      const obj = await bucket.get(`ocr_cache/${fileName}.json`)
      return obj ? ((await obj.json()) as PageText[]) : null
    },
    async put(fileName, pages) {
      await bucket.put(`ocr_cache/${fileName}.json`, JSON.stringify(pages))
    },
  }
}

const STEP_OCR = { retries: { limit: 3, delay: '15 seconds' as const }, timeout: '15 minutes' as const }
const STEP_UPSERT = { retries: { limit: 3, delay: '10 seconds' as const }, timeout: '15 minutes' as const }

export class IngestWorkflow extends WorkflowEntrypoint<Env, IngestParams> {
  async run(event: WorkflowEvent<IngestParams>, step: WorkflowStep) {
    const { fileName, r2Key, statusKey } = event.payload
    const bucket = this.env.BUCKET
    const writeStatus = (s: Record<string, unknown>) => bucket.put(statusKey, JSON.stringify(s))

    try {
      // OCR（带 R2 缓存）：从 R2 取 PDF 字节 → PaddleOCR-VL → 逐页 markdown。
      const pages = await step.do('ocr', STEP_OCR, async () => {
        await writeStatus({ stage: 'ocr' })
        const obj = await bucket.get(r2Key)
        if (!obj) throw new Error(`R2 找不到 PDF：${r2Key}`)
        const bytes = new Uint8Array(await obj.arrayBuffer())
        return await cachedOcrPages(bytes, fileName, r2OcrCache(bucket))
      })

      // 指标行切块（ADR-0004）。
      const records = await step.do('chunk', async () => {
        await writeStatus({ stage: 'chunk' })
        return await chunkPages(pages, fileName)
      })

      // 建索引 + 分批 embed/upsert（id 幂等覆盖，重跑不重复入库）。
      await step.do('embed-upsert', STEP_UPSERT, async () => {
        await writeStatus({ stage: 'embed' })
        await ensureTable()
        await upsertRecords(records)
      })

      await writeStatus({ stage: 'done', pages: pages.length, chunks: records.length })
      return { pages: pages.length, chunks: records.length }
    } catch (err) {
      await writeStatus({ stage: 'error', message: err instanceof Error ? err.message : String(err) })
      throw err
    }
  }
}
