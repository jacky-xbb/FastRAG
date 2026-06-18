// 进程内入库任务（Node/fly.io 入口用）：fly.io 是常驻进程，
// 入库长任务直接在进程里串行跑即可——不引消息队列。复用 ingest-pipeline 同一套管线，
// 进度经 BUCKET shim 写 ingest_status/<id>.json，故 handleIngestStatus 零改动。
// 串行：避免两个 OCR+embed 同时压垮小机器。重启会丢在途任务（状态停在 embed）——server 启动时标记 error。
import { join } from 'node:path'
import { cachedOcrPages, chunkPages, ensureTable, upsertRecords } from './ingest-pipeline.js'
import { fsOcrCache } from './ocr-cache-fs.js'
import { DATA_DIR } from './fs-bucket.js'
import type { AppEnv } from '../app.js'

type Bucket = AppEnv['BUCKET']

export function createIngestRunner(bucket: Bucket): AppEnv['INGEST_WORKFLOW'] {
  const ocrCache = fsOcrCache(join(DATA_DIR, 'ocr_cache'))
  // 任务实例状态兜底（handleIngestStatus 优先读 BUCKET 进度 JSON，缺失才查这里）。
  const states = new Map<string, string>()
  // 串行队列：用一条 promise 链把任务排队跑。
  let chain: Promise<unknown> = Promise.resolve()

  async function runJob(id: string, p: { fileName: string; r2Key: string; statusKey: string }) {
    const writeStatus = (s: Record<string, unknown>) => bucket.put(p.statusKey, JSON.stringify(s))
    try {
      states.set(id, 'running')
      await writeStatus({ stage: 'ocr' })
      const obj = await bucket.get(p.r2Key)
      if (!obj) throw new Error(`找不到 PDF：${p.r2Key}`)
      const bytes = new Uint8Array(await obj.arrayBuffer())
      const pages = await cachedOcrPages(bytes, p.fileName, ocrCache)

      await writeStatus({ stage: 'chunk' })
      const records = await chunkPages(pages, p.fileName)

      await writeStatus({ stage: 'embed' })
      await ensureTable()
      await upsertRecords(records)

      await writeStatus({ stage: 'done', pages: pages.length, chunks: records.length })
      states.set(id, 'complete')
    } catch (err) {
      await writeStatus({ stage: 'error', message: err instanceof Error ? err.message : String(err) })
      states.set(id, 'errored')
      console.error(`[ingest] ${p.fileName} 入库失败:`, err)
    }
  }

  return {
    async create({ id, params }) {
      states.set(id, 'running')
      // 接到队尾，立即返回（前端靠轮询进度）。catch 防止链断裂。
      chain = chain.then(() => runJob(id, params)).catch(() => {})
    },
    async get(id) {
      return { async status() {
        return { status: states.get(id) ?? 'unknown' }
      } }
    },
  }
}
