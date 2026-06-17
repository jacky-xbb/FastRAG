// 上传向量化（#10）：POST /api/ingest（原始 PDF 字节，文件名走 ?name=）拿入库任务 id，
// 再轮询 /api/ingest/status?id= 读 Workflow 写在 R2 的真实进度（入库已上云，OCR 长任务走 Workflow）。
// 进度 JSON：{stage:'upload'|'ocr'|'chunk'|'embed'} / {stage:'done', pages, chunks} / {stage:'error', message}。
// 任务 id 落 localStorage：线上 Workflow 可能跑数分钟，刷新/切走再回来能「重连」轮询，不再凭空消失。
import { useCallback, useEffect, useRef, useState } from 'react'
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

const STORAGE_KEY = 'fastrag:ingest:active' // 未完成的入库任务 {id, fileName}
const stageIndex = (key: string) => INGEST_STAGES.findIndex((s) => s.key === key)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function useIngest(onDone?: () => void) {
  const [job, setJob] = useState<IngestJob | null>(null)
  const aborted = useRef<AbortController | null>(null)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  // 轮询某个任务 id 的进度直到 done/error 或被取消；done/error 时清掉本地持久化。
  const poll = useCallback(async (id: string, fileName: string, signal: AbortSignal) => {
    const base: IngestJob = { fileName, stage: 0, done: false, pages: 0, chunks: 0 }
    try {
      for (;;) {
        if (signal.aborted) return
        await sleep(1500)
        if (signal.aborted) return
        const sres = await fetch(`/api/ingest/status?id=${encodeURIComponent(id)}`, { signal })
        if (!sres.ok) continue
        const ev = (await sres.json()) as { stage: string; pages?: number; chunks?: number; message?: string }
        if (ev.stage === 'done') {
          localStorage.removeItem(STORAGE_KEY)
          setJob((j) => ({ ...(j ?? base), stage: INGEST_STAGES.length, done: true, pages: ev.pages ?? 0, chunks: ev.chunks ?? 0 }))
          onDoneRef.current?.()
          return
        }
        if (ev.stage === 'error') {
          localStorage.removeItem(STORAGE_KEY)
          setJob((j) => ({ ...(j ?? base), error: ev.message ?? '入库失败' }))
          return
        }
        const idx = stageIndex(ev.stage)
        if (idx >= 0) setJob((j) => ({ ...(j ?? base), stage: idx }))
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setJob((j) => (j ? { ...j, error: e instanceof Error ? e.message : String(e) } : j))
    }
  }, [])

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
        // 落地 id，刷新可重连（服务端 Workflow 仍在跑）。
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ id, fileName: file.name }))
        await poll(id, file.name, ac.signal)
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        setJob((j) => (j ? { ...j, error: e instanceof Error ? e.message : String(e) } : j))
      }
    },
    [poll],
  )

  // 刷新/重进页面：若本地存有未完成的入库 id，自动接上轮询。
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    let parsed: { id?: string; fileName?: string }
    try {
      parsed = JSON.parse(raw)
    } catch {
      localStorage.removeItem(STORAGE_KEY)
      return
    }
    if (!parsed.id) return
    const ac = new AbortController()
    aborted.current = ac
    setJob({ fileName: parsed.fileName ?? '', stage: 0, done: false, pages: 0, chunks: 0 })
    poll(parsed.id, parsed.fileName ?? '', ac.signal)
    return () => ac.abort()
  }, [poll])

  const clear = useCallback(() => {
    aborted.current?.abort()
    localStorage.removeItem(STORAGE_KEY)
    setJob(null)
  }, [])

  return { job, start, clear }
}
