import { describe, it, expect } from 'vitest'
import { firstUserText, deriveThreadTitle } from '../src/lib/threads.js'

describe('firstUserText', () => {
  it('取首条 user 消息、拼接其 text parts', () => {
    const msgs = [
      { role: 'user', parts: [{ type: 'text', text: 'GBT 18242-2025 ' }, { type: 'text', text: '可溶物含量？' }] },
      { role: 'assistant', parts: [{ type: 'text', text: '答案……' }] },
      { role: 'user', parts: [{ type: 'text', text: '第二个问题' }] },
    ]
    expect(firstUserText(msgs)).toBe('GBT 18242-2025 可溶物含量？')
  })

  it('忽略非 text part（如 tool 调用），只拼文本', () => {
    const msgs = [
      { role: 'user', parts: [{ type: 'step-start' }, { type: 'text', text: '问题' }] as any },
    ]
    expect(firstUserText(msgs)).toBe('问题')
  })

  it('首条是 assistant 时跳过它，取后面的 user', () => {
    const msgs = [
      { role: 'assistant', parts: [{ type: 'text', text: '你好' }] },
      { role: 'user', parts: [{ type: 'text', text: '我的问题' }] },
    ]
    expect(firstUserText(msgs)).toBe('我的问题')
  })

  it('无 user 消息返回空串', () => {
    expect(firstUserText([{ role: 'assistant', parts: [{ type: 'text', text: 'x' }] }])).toBe('')
    expect(firstUserText([])).toBe('')
  })
})

describe('deriveThreadTitle', () => {
  it('短问题原样返回（折叠空白、去首尾空格）', () => {
    expect(deriveThreadTitle('  拉伸强度\n要求  ')).toBe('拉伸强度 要求')
  })

  it('超长截断并加省略号', () => {
    const long = 'GBT 18242-2025 中 I 型弹性体改性沥青防水卷材的可溶物含量要求是多少'
    const t = deriveThreadTitle(long, 12)
    expect(t).toBe(long.slice(0, 12) + '…')
    expect(t.length).toBe(13)
  })

  it('空文本回退「新会话」', () => {
    expect(deriveThreadTitle('')).toBe('新会话')
    expect(deriveThreadTitle('   ')).toBe('新会话')
  })
})
