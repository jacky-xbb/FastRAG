// 上传向量化的模拟进度。后端尚未接 HTTP ingest，这里按真实管线阶段
// （见 mockData.INGEST_STAGES）模拟逐步推进，演示「导入 PDF → 向量化」的交互。
// TODO(接后端)：start() 改为 POST /api/ingest（multipart PDF），用 SSE/轮询推真实阶段进度。
import { useCallback, useRef, useState } from 'react'
import { INGEST_STAGES } from './mockData'

export interface IngestJob {
  fileName: string
  /** 当前阶段下标，= INGEST_STAGES.length 表示完成 */
  stage: number
  done: boolean
  /** 模拟产出 */
  pages: number
  chunks: number
}

const STAGE_MS = [500, 2200, 900, 1400, 700] // 各阶段耗时，OCR 最久

export function useIngestSim() {
  const [job, setJob] = useState<IngestJob | null>(null)
  const timer = useRef<number | null>(null)

  const start = useCallback((fileName: string) => {
    if (timer.current) window.clearTimeout(timer.current)
    const pages = 8 + Math.floor(fileName.length % 20)
    const chunks = pages * (6 + (fileName.length % 5))
    setJob({ fileName, stage: 0, done: false, pages, chunks })

    const step = (s: number) => {
      if (s >= INGEST_STAGES.length) {
        setJob((j) => (j ? { ...j, stage: s, done: true } : j))
        return
      }
      setJob((j) => (j ? { ...j, stage: s } : j))
      timer.current = window.setTimeout(() => step(s + 1), STAGE_MS[s] ?? 800)
    }
    timer.current = window.setTimeout(() => step(1), STAGE_MS[0])
  }, [])

  const clear = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current)
    setJob(null)
  }, [])

  return { job, start, clear }
}
