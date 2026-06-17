// 检索台（三栏）：左历史会话、中对话（ai-elements）、右证据面板。
// 当前会话由 URL 决定：/chat = 新会话；/chat/:threadId = 该会话（深链/刷新保留，ADR-0007）。
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Pencil, Trash2 } from 'lucide-react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { Conversation, ConversationContent } from '@/components/ai-elements/conversation'
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message'
import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from '@/components/ai-elements/prompt-input'
import { Tool, ToolHeader, ToolContent, ToolInput, ToolOutput } from '@/components/ai-elements/tool'
import { Loader } from '@/components/ai-elements/loader'
import { Suggestion } from '@/components/ai-elements/suggestion'
import { useThreads } from '../lib/useThreads'
import { SUGGESTIONS } from '../lib/mockData'

const newThreadId = () => 'web-' + Math.random().toString(36).slice(2)

function fmtWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  return sameDay
    ? `今天 ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
    : `${d.getMonth() + 1} 月 ${d.getDate()} 日`
}

type AnyPart = { type: string; text?: string; toolName?: string; state?: string; input?: unknown; output?: unknown; errorText?: string }
const textOf = (m: UIMessage) => (m.parts as AnyPart[]).filter((p) => p.type === 'text').map((p) => p.text ?? '').join('')
const toolPartsOf = (m: UIMessage) => (m.parts as AnyPart[]).filter((p) => p.type === 'dynamic-tool' || p.type.startsWith('tool-'))
const toolNameOf = (p: AnyPart) => (p.type === 'dynamic-tool' ? p.toolName ?? '' : p.type.replace(/^tool-/, ''))

interface Source { code: string; table: string; page: string; web: boolean }
// 从 tool-output 的确定串 `[标准号｜表名｜第X页]` 解析来源（ADR-0006）。
function parseSources(parts: AnyPart[]): Source[] {
  const out: Source[] = []
  const seen = new Set<string>()
  for (const p of parts) {
    if (toolNameOf(p) === 'webSearchTool') {
      if (p.output && !seen.has('web')) {
        seen.add('web')
        out.push({ code: '联网结果', table: '', page: '', web: true })
      }
      continue
    }
    const output = typeof p.output === 'string' ? p.output : ''
    const re = /\[([^｜\]]+)｜([^｜\]]+)｜第\s*([\d、,，\-]+)\s*页\]/g
    let mt: RegExpExecArray | null
    while ((mt = re.exec(output))) {
      const code = mt[1].trim()
      const key = code + '|' + mt[3].trim()
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ code, table: mt[2].trim(), page: mt[3].trim(), web: false })
    }
  }
  return out
}

export function ChatPage() {
  const { threadId: param } = useParams()
  const navigate = useNavigate()
  const idRef = useRef(newThreadId()) // 当前会话 id（/chat 新会话用；深链时由下方 effect 切到 param）
  const loadedRef = useRef<string | null>(null) // 已拉过历史的 threadId（StrictMode 双跑 / 覆盖守卫）
  const transport = useRef(
    new DefaultChatTransport({
      api: '/api/chat',
      // 服务端记忆为准（ADR-0006）：只发最新一条 + threadId。
      prepareSendMessagesRequest: ({ messages }) => ({
        body: { messages: messages.slice(-1), threadId: idRef.current },
      }),
    }),
  )
  const { threads, refresh: refreshThreads, rename, remove } = useThreads()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const { messages, status, sendMessage, setMessages } = useChat({
    transport: transport.current,
    onFinish: () => refreshThreads(),
  })

  // URL 带 :threadId 且尚未拉过 → 加载该会话历史（深链 / 刷新 / 点历史）。
  // 守卫用 loadedRef（成功后才记），不拿 idRef 自卡：否则 StrictMode 双跑时第一次的 fetch 被清理取消、第二次又被守卫挡掉，历史拉不进来。
  useEffect(() => {
    if (!param || param === loadedRef.current) return
    idRef.current = param
    let alive = true
    fetch('/api/messages?threadId=' + encodeURIComponent(param))
      .then((r) => (r.ok ? r.json() : []))
      .then((msgs) => {
        if (!alive) return
        setMessages(msgs as UIMessage[])
        loadedRef.current = param
      })
      .catch(() => alive && setMessages([]))
    return () => {
      alive = false
    }
  }, [param, setMessages])

  function newChat() {
    idRef.current = newThreadId()
    setMessages([])
    navigate('/chat')
  }

  function startEdit(id: string, title: string) {
    setEditingId(id)
    setEditValue(title)
  }

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
      if (id === activeId) newChat() // 删的是当前会话 → 回到新会话空白态
    } catch {
      /* 删除失败：忽略，列表不变 */
    }
  }

  function send(text: string) {
    if (!text.trim()) return
    sendMessage({ text })
    // 新会话首次发送：把 id 写进 URL，深链/刷新可回到这条对话。
    // 先标记该会话已"加载"，免得下方 effect 因 param 变化去拉历史、覆盖正在进行的对话。
    if (!param) {
      loadedRef.current = idRef.current
      navigate('/chat/' + idRef.current, { replace: true })
    }
  }

  const activeId = param ?? idRef.current
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
  const lastTools = lastAssistant ? toolPartsOf(lastAssistant) : []
  const sources = parseSources(lastTools)

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* 左：历史会话 */}
      <aside className="w-56 flex-none overflow-y-auto border-r border-zinc-800 p-3 text-sm">
        <button onClick={newChat} className="mb-3 w-full rounded-md border border-zinc-700 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">+ 新会话</button>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">历史</div>
        {!threads && <div className="px-2 text-xs text-zinc-600">加载中…</div>}
        {threads && threads.length === 0 && <div className="px-2 text-xs text-zinc-600">暂无历史会话。</div>}
        {threads?.map((s) => (
          <div
            key={s.id}
            onClick={() => editingId !== s.id && navigate('/chat/' + s.id)}
            className={`group relative mb-0.5 cursor-pointer rounded px-2 py-1.5 hover:bg-zinc-800 ${s.id === activeId ? 'bg-zinc-800' : ''}`}
          >
            {editingId === s.id ? (
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onBlur={() => commitEdit(s.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdit(s.id)
                  else if (e.key === 'Escape') setEditingId(null)
                }}
                className="w-full rounded border border-zinc-600 bg-zinc-900 px-1 py-0.5 text-zinc-100 outline-none focus:border-emerald-500"
              />
            ) : (
              <span className="block truncate pr-12 text-zinc-300">{s.title}</span>
            )}
            <span className="block truncate text-xs text-zinc-600">{fmtWhen(s.updatedAt)}</span>
            {editingId !== s.id && (
              <div className="absolute right-1.5 top-1.5 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  aria-label="编辑标题"
                  onClick={(e) => {
                    e.stopPropagation()
                    startEdit(s.id, s.title)
                  }}
                  className="rounded p-1 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  aria-label="删除会话"
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteThread(s.id)
                  }}
                  className="rounded p-1 text-zinc-400 hover:bg-zinc-700 hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
      </aside>

      {/* 中：对话 */}
      <main className="flex flex-1 flex-col overflow-hidden">
        <Conversation className="flex-1">
          <ConversationContent>
            {messages.map((m) => (
              <Message from={m.role} key={m.id}>
                <MessageContent>
                  {m.role === 'assistant' ? <MessageResponse>{textOf(m)}</MessageResponse> : textOf(m)}
                </MessageContent>
              </Message>
            ))}
            {status === 'submitted' && <Loader />}
          </ConversationContent>
        </Conversation>
        <div className="p-3">
          {messages.length === 0 && (
            <div className="mb-2 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <Suggestion key={s} suggestion={s} onClick={(t) => send(t)} />
              ))}
            </div>
          )}
          <PromptInput onSubmit={(msg) => send(msg.text ?? '')}>
            <PromptInputBody>
              <PromptInputTextarea placeholder="检索国标…（Enter 发送）" />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputSubmit status={status} className="ml-auto" />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </main>

      {/* 右：证据面板 */}
      <aside className="w-80 flex-none overflow-y-auto border-l border-zinc-800 bg-zinc-900/40 p-4 text-sm">
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">检索轨迹</div>
        {lastTools.length > 0 ? (
          <div className="mt-2 space-y-2">
            {lastTools.map((p, i) => (
              <Tool key={i} defaultOpen={false}>
                <ToolHeader type={p.type as `tool-${string}`} state={p.state as never} />
                <ToolContent>
                  <ToolInput input={p.input} />
                  <ToolOutput output={p.output} errorText={p.errorText} />
                </ToolContent>
              </Tool>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-zinc-600">提问后这里显示库内/联网检索过程。</p>
        )}

        <div className="mt-5 text-xs font-semibold uppercase tracking-wide text-zinc-500">来源引用</div>
        {sources.length > 0 ? (
          <ul className="mt-2 space-y-1.5">
            {sources.map((s, i) => (
              <li key={i} className={`rounded-md border px-2.5 py-2 text-xs ${s.web ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}`}>
                <div className="font-medium">{s.web ? '🌐 联网' : '📑 本地库'}</div>
                <div className="font-mono">{s.code}{s.page ? ` · 第 ${s.page} 页` : ''}{s.table ? ` · ${s.table}` : ''}</div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-zinc-600">答案里的标准号/页码会自动汇到这里。</p>
        )}
      </aside>
    </div>
  )
}
