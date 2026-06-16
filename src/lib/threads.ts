// 历史会话列表的纯逻辑（#12）：从会话消息派生标题。
// 读库（listThreads/recall）与 UI 消息转换由 web.ts 负责；这里只做可单测的纯转换。

export interface UIMessageLike {
  role: string
  parts?: { type: string; text?: string }[]
}

/** 取首条 user 消息的纯文本（拼接其 text parts）。无 user 消息时返回 ''。 */
export function firstUserText(messages: UIMessageLike[]): string {
  const u = messages.find((m) => m.role === 'user')
  if (!u) return ''
  return (u.parts ?? [])
    .filter((p) => p.type === 'text')
    .map((p) => p.text ?? '')
    .join('')
    .trim()
}

/** 由首条用户提问派生会话标题：折叠空白、截断到 maxLen（超出加 …），空则回退「新会话」。 */
export function deriveThreadTitle(text: string, maxLen = 24): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t) return '新会话'
  return t.length > maxLen ? t.slice(0, maxLen) + '…' : t
}
