// 把 useThreads 抬到外壳层共享：AppSidebar 渲染历史 + ChatPage 发完消息后刷新，
// 共用同一个实例，否则两个 useThreads 各自持有本地 state，刷新互不可见。
import { createContext, useContext, type ReactNode } from 'react'
import { useThreads } from './useThreads'

type ThreadsValue = ReturnType<typeof useThreads>
const ThreadsContext = createContext<ThreadsValue | null>(null)

export function ThreadsProvider({ children }: { children: ReactNode }) {
  const value = useThreads()
  return <ThreadsContext.Provider value={value}>{children}</ThreadsContext.Provider>
}

export function useThreadsContext(): ThreadsValue {
  const ctx = useContext(ThreadsContext)
  if (!ctx) throw new Error('useThreadsContext 必须在 ThreadsProvider 内使用')
  return ctx
}
