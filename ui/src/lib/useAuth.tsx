// 登录态（ADR-0007）：加载时 GET /api/me 判断；任何请求 401 → 清登录态（守卫跳 /login）。
// cookie 是 httpOnly，JS 读不到，故登录态只能问后端。
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

interface AuthState {
  user: string | null
  loading: boolean
  login: (user: string, password: string) => Promise<string | null> // 返回错误文案，null=成功
  logout: () => Promise<void>
}

const Ctx = createContext<AuthState>(null!)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // 全局 401 拦截：会话过期时任何 API 调用都会把登录态清掉，守卫据此跳 /login。
  useEffect(() => {
    const orig = window.fetch
    window.fetch = async (...args) => {
      const r = await orig(...args)
      if (r.status === 401) setUser(null)
      return r
    }
    return () => {
      window.fetch = orig
    }
  }, [])

  useEffect(() => {
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setUser(d?.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const login = async (u: string, password: string) => {
    const r = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user: u, password }),
    })
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      return (d as any).error ?? '登录失败'
    }
    setUser((await r.json()).user)
    return null
  }

  const logout = async () => {
    await fetch('/api/logout', { method: 'POST' })
    setUser(null)
  }

  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>
}
