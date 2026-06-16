// 受保护布局：未登录跳 /login；已登录渲染暗色三栏外壳（Header + NavLink + 退出）+ 子路由。
import { Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from './lib/useAuth'

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
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-200">
      <header className="flex items-center gap-4 border-b border-zinc-800 px-4 py-2 text-sm">
        <span className="flex items-center gap-2 font-semibold text-zinc-100">
          <span className="grid h-6 w-6 place-items-center rounded bg-emerald-500 text-xs text-zinc-950">标</span>
          国标问答 <span className="text-zinc-600">workbench</span>
        </span>
        <nav className="ml-2 flex gap-1">
          <NavLink to="/chat" className={tab}>检索台</NavLink>
          <NavLink to="/upload" className={tab}>入库</NavLink>
        </nav>
        <span className="ml-auto text-xs text-zinc-600">libSQL · text-embedding-3-small</span>
        <button
          onClick={async () => {
            await logout()
            navigate('/login', { replace: true })
          }}
          className="text-xs text-zinc-500 hover:text-zinc-200"
        >
          退出（{user}）
        </button>
      </header>
      <Outlet />
    </div>
  )
}
