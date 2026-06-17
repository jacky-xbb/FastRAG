// 历史会话侧栏（shadcn Sidebar）：品牌 + 新会话 + 历史列表（hover 改名/删除）。
// 会话状态由 URL 决定（/chat/:threadId）；新会话 = navigate('/chat')，ChatPage 据无 param 清空对话。
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { Logo } from './Logo'
import { useThreadsContext } from '../lib/threadsContext'

function fmtWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  return sameDay
    ? `今天 ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
    : `${d.getMonth() + 1} 月 ${d.getDate()} 日`
}

export function AppSidebar() {
  const { threadId: param } = useParams()
  const navigate = useNavigate()
  const { threads, rename, remove } = useThreadsContext()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const activeId = param ?? null

  async function commitEdit(id: string) {
    const title = editValue.trim()
    setEditingId(null)
    if (!title) return
    try {
      await rename(id, title)
    } catch {
      /* 改名失败：列表保持原样，刷新时回到库内标题 */
    }
  }

  async function deleteThread(id: string) {
    if (!window.confirm('确定删除这个会话？删除后无法恢复。')) return
    try {
      await remove(id)
      if (id === activeId) navigate('/chat') // 删的是当前会话 → 回到新会话空白态
    } catch {
      /* 删除失败：忽略，列表不变 */
    }
  }

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-1 py-1 font-semibold">
          <Logo className="text-emerald-400" size={22} />
          <span className="font-mono tracking-tight">fastrag</span>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => navigate('/chat')}
              className="border border-sidebar-border"
            >
              <Plus />
              <span>新会话</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>历史</SidebarGroupLabel>
          <SidebarGroupContent>
            {!threads && <div className="px-2 text-xs text-sidebar-foreground/50">加载中…</div>}
            {threads && threads.length === 0 && (
              <div className="px-2 text-xs text-sidebar-foreground/50">暂无历史会话。</div>
            )}
            <SidebarMenu>
              {threads?.map((s) => (
                <SidebarMenuItem key={s.id}>
                  {editingId === s.id ? (
                    <input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => commitEdit(s.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitEdit(s.id)
                        else if (e.key === 'Escape') setEditingId(null)
                      }}
                      className="h-8 w-full rounded-md border border-sidebar-border bg-sidebar px-2 text-sm text-sidebar-foreground outline-none focus:border-emerald-500"
                    />
                  ) : (
                    <>
                      <SidebarMenuButton
                        size="lg"
                        isActive={s.id === activeId}
                        onClick={() => navigate('/chat/' + s.id)}
                      >
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate">{s.title}</span>
                          <span className="truncate text-xs text-sidebar-foreground/50">
                            {fmtWhen(s.updatedAt)}
                          </span>
                        </div>
                      </SidebarMenuButton>
                      <SidebarMenuAction
                        showOnHover
                        className="right-7 top-2.5"
                        aria-label="编辑标题"
                        onClick={() => {
                          setEditingId(s.id)
                          setEditValue(s.title)
                        }}
                      >
                        <Pencil />
                      </SidebarMenuAction>
                      <SidebarMenuAction
                        showOnHover
                        className="top-2.5 hover:text-red-400"
                        aria-label="删除会话"
                        onClick={() => deleteThread(s.id)}
                      >
                        <Trash2 />
                      </SidebarMenuAction>
                    </>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  )
}
