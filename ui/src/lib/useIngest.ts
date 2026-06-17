// 上传向量化（#10）：POST /api/ingest（原始 PDF 字节，文件名走 ?name=）拿入库任务 id，
// 再轮询 /api/ingest/status?id= 读 Workflow 写在 R2 的真实进度（入库已上云，OCR 长任务走 Workflow）。
// 进度 JSON：{stage:'upload'|'ocr'|'chunk'|'embed'} / {stage:'done', pages, chunks} / {stage:'error', message}。
import { useCallback, useRef, useState } from 'react'
import { INGEST_STAGES } from './mockData'

export interface IngestJob {
  fileName: string
  /** 当前阶段下标，= INGEST_STAGES.length 表示完成 */
  stage: number
  done: boolean
  pages: number
  chunks: number
  error?: string
}

const stageIndex = (key: string) => INGEST_STAGES.findIndex((s) => s.key === key)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function useIngest(onDone?: () => void) {
  const [job, setJob] = useState<IngestJob | null>(null)
  const aborted = useRef<AbortController | null>(null)

  const start = useCallback(
    async (file: File) => {
      aborted.current?.abort()
      const ac = new AbortController()
      aborted.current = ac
      setJob({ fileName: file.name, stage: 0, done: false, pages: 0, chunks: 0 })

      try {
        const res = await fetch(`/api/ingest?name=${encodeURIComponent(file.name)}`, {
          method: 'POST',
          body: file,
          signal: ac.signal,
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const { id } = (await res.json()) as { id: string }

        // 轮询 Workflow 进度，直到 done/error 或被取消。
        for (;;) {
          if (ac.signal.aborted) return
          await sleep(1500)
          if (ac.signal.aborted) return
          const sres = await fetch(`/api/ingest/status?id=${encodeURIComponent(id)}`, {
            signal: ac.signal,
          })
          if (!sres.ok) continue
          const ev = (await sres.json()) as {
            stage: string
            pages?: number
            chunks?: number
            message?: string
          }
          if (ev.stage === 'done') {
            setJob((j) =>
              j
                ? { ...j, stage: INGEST_STAGES.length, done: true, pages: ev.pages ?? 0, chunks: ev.chunks ?? 0 }
                : j,
            )
            onDone?.()
            return
          }
          if (ev.stage === 'error') {
            setJob((j) => (j ? { ...j, error: ev.message ?? '入库失败' } : j))
            return
          }
          const idx = stageIndex(ev.stage)
          if (idx >= 0) setJob((j) => (j ? { ...j, stage: idx } : j))
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        setJob((j) => (j ? { ...j, error: e instanceof Error ? e.message : String(e) } : j))
      }
    },
    [onDone],
  )

  const clear = useCallback(() => {
    aborted.current?.abort()
    setJob(null)
  }, [])

  return { job, start, clear }
}
