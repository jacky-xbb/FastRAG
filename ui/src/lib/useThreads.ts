// 历史会话列表（#12）：拉 GET /api/threads，渲染真实会话。
// 标题由后端从首条用户消息派生（src/lib/threads.ts），按更新时间倒序。
import { useCallback, useEffect, useState } from 'react'

export interface ThreadSummary {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export function useThreads() {
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch('/api/threads')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setThreads((await res.json()) as ThreadSummary[])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { threads, error, refresh }
}
