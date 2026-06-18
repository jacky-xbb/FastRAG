// 上传向量化（#10）：POST /api/ingest（原始 PDF 字节，文件名走 ?name=）拿入库任务 id，
// 再轮询 /api/ingest/status?id= 读 Workflow 写在 R2 的真实进度（入库已上云，OCR 长任务走 Workflow）。
// 任务 id 落 localStorage：线上 Workflow 可能跑数分钟，刷新/切走再回来能「重连」轮询，不再凭空消失。
// 多文件：选/拖多个 PDF 逐个排队【串行】入库（后端一次只收一个），UI 显示整条队列。
import { useCallback, useEffect, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { INGEST_STAGES } from './mockData'

export interface IngestJob {
  /** 本地唯一 key（区分队列里同名文件） */
  id: string
  fileName: string
  /** 当前阶段下标，= INGEST_STAGES.length 表示完成 */
  stage: number
  done: boolean
  pages: number
  chunks: number
  error?: string
  /** 还在排队、未轮到上传 */
  queued?: boolean
}

const STORAGE_KEY = 'fastrag:ingest:active' // 正在跑的入库任务 {id, fileName, jobId}（仅持久化串行中的当前一个）
const stageIndex = (key: string) => INGEST_STAGES.findIndex((s) => s.key === key)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function useIngest(onDone?: () => void) {
  const [jobs, setJobs] = useState<IngestJob[]>([])
  const aborted = useRef<AbortController | null>(null)
  const queueRef = useRef<{ file: File; jobId: string }[]>([]) // 待处理文件队列
  const runningRef = useRef(false) // 串行 runner 是否在跑
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  const patchJob = useCallback((jobId: string, patch: Partial<IngestJob>) => {
    setJobs((js) => js.map((j) => (j.id === jobId ? { ...j, ...patch } : j)))
  }, [])

  // 轮询某个任务 id 的进度直到 done/error 或被取消；done/error 时清掉本地持久化。
  const poll = useCallback(
    async (jobId: string, ingestId: string, signal: AbortSignal) => {
      try {
        for (;;) {
          if (signal.aborted) return
          await sleep(1500)
          if (signal.aborted) return
          const sres = await fetch(`/api/ingest/status?id=${encodeURIComponent(ingestId)}`, { signal })
          if (!sres.ok) continue
          const ev = (await sres.json()) as { stage: string; pages?: number; chunks?: number; message?: string }
          if (ev.stage === 'done') {
            localStorage.removeItem(STORAGE_KEY)
            patchJob(jobId, { stage: INGEST_STAGES.length, done: true, pages: ev.pages ?? 0, chunks: ev.chunks ?? 0 })
            onDoneRef.current?.()
            return
          }
          if (ev.stage === 'error') {
            localStorage.removeItem(STORAGE_KEY)
            patchJob(jobId, { error: ev.message ?? '入库失败' })
            return
          }
          const idx = stageIndex(ev.stage)
          if (idx >= 0) patchJob(jobId, { stage: idx })
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        patchJob(jobId, { error: e instanceof Error ? e.message : String(e) })
      }
    },
    [patchJob],
  )

  // 串行 runner：依次取队列头，上传一个、轮询到 done/error，再下一个。
  const run = useCallback(async () => {
    if (runningRef.current) return
    runningRef.current = true
    while (queueRef.current.length) {
      const { file, jobId } = queueRef.current.shift()!
      patchJob(jobId, { queued: false })
      const ac = new AbortController()
      aborted.current = ac
      try {
        const res = await fetch(`/api/ingest?name=${encodeURIComponent(file.name)}`, {
          method: 'POST',
          body: file,
          signal: ac.signal,
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const { id } = (await res.json()) as { id: string }
        // 落地 id，刷新可重连（服务端 Workflow 仍在跑）。仅持久化当前串行中的这一个。
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ id, fileName: file.name, jobId }))
        await poll(jobId, id, ac.signal)
      } catch (e) {
        if ((e as Error).name === 'AbortError') {
          runningRef.current = false
          return // clear/卸载取消：整条队列停跑
        }
        patchJob(jobId, { error: e instanceof Error ? e.message : String(e) })
      }
    }
    runningRef.current = false
  }, [patchJob, poll])

  // 入队并启动（已在跑则自动接着处理）。queued 文件先以排队态显示。
  const start = useCallback(
    (files: File[]) => {
      if (!files.length) return
      const entries = files.map((file) => ({ file, jobId: nanoid() }))
      setJobs((js) => [
        ...js,
        ...entries.map(({ file, jobId }) => ({
          id: jobId,
          fileName: file.name,
          stage: 0,
          done: false,
          pages: 0,
          chunks: 0,
          queued: true,
        })),
      ])
      queueRef.current.push(...entries)
      run()
    },
    [run],
  )

  // 刷新/重进页面：若本地存有未完成的入库 id，自动接上轮询（仅当时串行中的那一个；
  // 还没上传的排队文件无法持久化 File，刷新后需重选）。
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
    const jobId = nanoid()
    const ac = new AbortController()
    aborted.current = ac
    setJobs([{ id: jobId, fileName: parsed.fileName ?? '', stage: 0, done: false, pages: 0, chunks: 0 }])
    poll(jobId, parsed.id, ac.signal)
    return () => ac.abort()
  }, [poll])

  // 清空：取消当前上传/轮询、清队列与列表。
  const clear = useCallback(() => {
    aborted.current?.abort()
    queueRef.current = []
    runningRef.current = false
    localStorage.removeItem(STORAGE_KEY)
    setJobs([])
  }, [])

  return { jobs, start, clear }
}
