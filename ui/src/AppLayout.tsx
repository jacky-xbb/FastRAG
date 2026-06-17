// 受保护布局：未登录跳 /login；已登录渲染 shadcn Sidebar 外壳（历史侧栏 + 顶栏 + 子路由）。
import { Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from './lib/useAuth'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { AppSidebar } from './components/AppSidebar'
import { ThreadsProvider } from './lib/threadsContext'

export function AppLayout() {
  const { user, loading, logout } = useAuth()
  const navigate = useNavigate()

  if (loading) {
    return <div className="grid h-screen place-items-center bg-zinc-950 text-sm text-zinc-500">加载中…</div>
  }
  if (!user) return <Navigate to="/login" replace />

  const tab = ({ isActive }: { isActive: boolean }) =>
    `rounded px-2.5 py-1 ${isActive ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`

  return (
    <ThreadsProvider>
      <SidebarProvider className="h-svh overflow-hidden bg-zinc-950 text-zinc-200">
        <AppSidebar />
        <SidebarInset className="min-h-0 overflow-hidden bg-zinc-950">
          <header className="flex flex-none items-center gap-3 border-b border-zinc-800 px-3 py-2 text-sm">
            <SidebarTrigger className="text-zinc-400 hover:text-zinc-100" />
            <nav className="flex gap-1">
              <NavLink to="/chat" className={tab}>检索台</NavLink>
              <NavLink to="/upload" className={tab}>入库</NavLink>
            </nav>
            <button
              className="ml-auto text-xs text-zinc-500 hover:text-zinc-200"
              onClick={async () => {
                await logout()
                navigate('/login', { replace: true })
              }}
            >
              退出（{user}）
            </button>
          </header>
          <Outlet />
        </SidebarInset>
      </SidebarProvider>
    </ThreadsProvider>
  )
}
