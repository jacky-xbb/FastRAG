// 仿 ai-sdk-ui useChat 的极简 hook，但接的是现有 /api/chat 的自定义 SSE
// （事件：{status} 检索/联网进度、{delta} 流式答案、{error}、{done}）。
// 选中某个方案后，要么把后端改成 AI SDK data-stream 协议直接用官方 useChat，
// 要么保留这个 hook —— 都行，原型阶段不纠结。
import { useCallback, useRef, useState } from 'react'

export type Role = 'user' | 'assistant'

export interface Source {
  /** 标准号，如 GB/T 18242-2025 */
  code: string
  /** 页码（可能没有） */
  page?: string
  /** 是否联网来源 */
  web?: boolean
  raw: string
}

export interface ChatMessage {
  id: string
  role: Role
  content: string
  /** 检索/联网轨迹（来自 status 事件，🔍 库内 / 🌐 联网） */
  trace: string[]
  /** 从答案文本里解析出的来源引用 */
  sources: Source[]
}

export type ChatStatus = 'ready' | 'submitted' | 'streaming'

// 从一段答案文本里抠出「来源：GB/T 18242-2025（第 3 页）」这类引用。
function parseSources(text: string): Source[] {
  const out: Source[] = []
  const seen = new Set<string>()
  // 标准号：字母+可选/+字母 空格 数字-年 ；后面可能跟（第 X 页）
  const re = /([A-Z]{2,}(?:\/[A-Z]+)?\s?\d{3,}(?:[.\-—]\d+)*(?:[-—]\d{4})?)\s*(?:（第?\s*([\d、,，\-]+)\s*页）|\(第?\s*([\d、,，\-]+)\s*页\))?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const code = m[1].trim()
    const page = m[2] || m[3]
    const key = code + '|' + (page ?? '')
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ code, page, raw: m[0], web: /联网/.test(text.slice(Math.max(0, m.index - 12), m.index)) })
  }
  return out
}

export function useStandardsChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [status, setStatus] = useState<ChatStatus>('ready')
  const threadId = useRef('proto-' + Math.random().toString(36).slice(2))

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || status !== 'ready') return

    const userMsg: ChatMessage = {
      id: 'u' + Date.now(),
      role: 'user',
      content: trimmed,
      trace: [],
      sources: [],
    }
    const botId = 'a' + Date.now()
    setMessages((m) => [
      ...m,
      userMsg,
      { id: botId, role: 'assistant', content: '', trace: [], sources: [] },
    ])
    setStatus('submitted')

    const patch = (fn: (b: ChatMessage) => ChatMessage) =>
      setMessages((m) => m.map((x) => (x.id === botId ? fn(x) : x)))

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: trimmed, threadId: threadId.current }),
      })
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({ error: 'HTTP ' + res.status }))
        patch((b) => ({ ...b, content: '出错了：' + (data.error || res.status) }))
        setStatus('ready')
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let acc = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop() ?? ''
        for (const part of parts) {
          const line = part.replace(/^data: /, '').trim()
          if (!line) continue
          let evt: any
          try {
            evt = JSON.parse(line)
          } catch {
            continue
          }
          if (evt.status != null) {
            patch((b) => ({ ...b, trace: [...b.trace, evt.status] }))
          } else if (evt.delta != null) {
            if (status !== 'streaming') setStatus('streaming')
            acc += evt.delta
            patch((b) => ({ ...b, content: acc, sources: parseSources(acc) }))
          } else if (evt.error) {
            patch((b) => ({ ...b, content: '出错了：' + evt.error }))
          }
        }
      }
    } catch (err: any) {
      patch((b) => ({ ...b, content: '请求失败：' + (err?.message ?? err) }))
    } finally {
      setStatus('ready')
    }
  }, [status])

  const reset = useCallback(() => {
    setMessages([])
    threadId.current = 'proto-' + Math.random().toString(36).slice(2)
  }, [])

  return { messages, status, sendMessage, reset }
}
