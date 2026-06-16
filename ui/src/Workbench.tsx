// 国标问答工作台 —— 专业暗色 · 三栏（IDE 式）。
// 设计语言：深底、高密度、等宽数字、证据前置。三屏：登录(split) → 导入(库+日志) → 三栏对话(含证据面板)。
// 对话走真实 /api/chat；上传向量化、历史列表暂为示例数据（见 mockData.ts 的 TODO：待后端补 /api/ingest、/api/threads）。
import { useState } from 'react'
import { useStandardsChat } from './lib/useStandardsChat'
import { useIngestSim } from './lib/useIngestSim'
import { MOCK_LIBRARY, MOCK_SESSIONS, SUGGESTIONS, INGEST_STAGES } from './lib/mockData'

export function Workbench() {
  const [authed, setAuthed] = useState(false)
  const [screen, setScreen] = useState<'chat' | 'upload'>('chat')

  if (!authed) return <Landing onLogin={() => setAuthed(true)} />

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-200">
      <header className="flex items-center gap-4 border-b border-zinc-800 px-4 py-2 text-sm">
        <span className="flex items-center gap-2 font-semibold text-zinc-100">
          <span className="grid h-6 w-6 place-items-center rounded bg-emerald-500 text-xs text-zinc-950">标</span>
          国标问答 <span className="text-zinc-600">workbench</span>
        </span>
        <nav className="ml-2 flex gap-1">
          <TabBtn active={screen === 'chat'} onClick={() => setScreen('chat')}>检索台</TabBtn>
          <TabBtn active={screen === 'upload'} onClick={() => setScreen('upload')}>入库</TabBtn>
        </nav>
        <span className="ml-auto text-xs text-zinc-600">libSQL · text-embedding-3-small</span>
        <button onClick={() => setAuthed(false)} className="text-xs text-zinc-500 hover:text-zinc-200">退出</button>
      </header>
      {screen === 'chat' ? <Chat /> : <Upload />}
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded px-2.5 py-1 ${active ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}>
      {children}
    </button>
  )
}

function Landing({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="grid min-h-screen grid-cols-1 bg-zinc-950 text-zinc-200 md:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-emerald-900/40 to-zinc-900 p-10 md:flex">
        <div className="flex items-center gap-2 font-semibold">
          <span className="grid h-7 w-7 place-items-center rounded bg-emerald-500 text-zinc-950">标</span>
          fastrag
        </div>
        <div>
          <h1 className="text-3xl font-semibold leading-snug text-zinc-50">防水卷材国标<br />检索工作台</h1>
          <p className="mt-3 max-w-sm text-sm text-zinc-400">混合检索（向量 + BM25 + 元数据过滤），指标行级命中，逐条标注标准号与页码。</p>
          <div className="mt-6 flex gap-6 font-mono text-sm text-zinc-500">
            <div><div className="text-2xl text-emerald-400">5</div>已入库标准</div>
            <div><div className="text-2xl text-emerald-400">726</div>指标块</div>
            <div><div className="text-2xl text-emerald-400">98</div>页</div>
          </div>
        </div>
        <div className="text-xs text-zinc-600">本地运行 · 数据不出库</div>
      </div>
      <div className="grid place-items-center p-8">
        <form
          onSubmit={(e) => { e.preventDefault(); onLogin() }}
          className="w-full max-w-sm space-y-4"
        >
          <h2 className="text-xl font-semibold text-zinc-100">登录</h2>
          <div>
            <label className="text-xs text-zinc-500">账号</label>
            <input className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-emerald-500" defaultValue="engineer@fastrag" />
          </div>
          <div>
            <label className="text-xs text-zinc-500">密码</label>
            <input type="password" className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-emerald-500" defaultValue="demo" />
          </div>
          <button className="w-full rounded-md bg-emerald-500 py-2.5 text-sm font-medium text-zinc-950 transition hover:bg-emerald-400">进入工作台</button>
          <p className="text-center text-xs text-zinc-600">原型演示 · 随便填直接进</p>
        </form>
      </div>
    </div>
  )
}

function Upload() {
  const { job, start, clear } = useIngestSim()
  return (
    <div className="flex flex-1 overflow-hidden">
      <section className="w-72 flex-none overflow-y-auto border-r border-zinc-800 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">已入库 <span className="normal-case text-zinc-600">（示例数据）</span></div>
        {MOCK_LIBRARY.map((d) => (
          <div key={d.id} className="mb-1 rounded-md border border-zinc-800 bg-zinc-900 p-2.5 text-sm">
            <div className="truncate font-medium text-zinc-200">{d.code}</div>
            <div className="truncate text-xs text-zinc-500">{d.name}</div>
            <div className="mt-1 flex items-center gap-2 font-mono text-[11px] text-zinc-600">
              <span>{d.pages}p</span><span>·</span><span>{d.chunks} chunks</span>
              <span className={`ml-auto rounded px-1.5 ${d.status === '废止' ? 'bg-zinc-800 text-zinc-500' : 'bg-emerald-500/15 text-emerald-400'}`}>{d.status}</span>
            </div>
          </div>
        ))}
      </section>

      <section className="flex-1 overflow-y-auto p-6">
        <h2 className="text-lg font-semibold text-zinc-100">入库新标准</h2>
        <label className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-700 bg-zinc-900/60 py-10 text-center hover:border-emerald-500/60">
          <span className="text-2xl">⬆</span>
          <span className="text-sm text-zinc-300">拖拽 PDF 或点击选择</span>
          <span className="font-mono text-xs text-zinc-600">pdf/*.pdf → OCR → chunk → embed → upsert</span>
          <input type="file" accept="application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && start(e.target.files[0].name)} />
        </label>

        {job && (
          <div className="mt-5 rounded-lg border border-zinc-800 bg-zinc-900 font-mono text-sm">
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2 text-zinc-300">
              <span className="truncate">$ ingest "{job.fileName}"</span>
              <button onClick={clear} className="text-xs text-zinc-500 hover:text-zinc-300">clear</button>
            </div>
            <div className="space-y-1 p-4">
              {INGEST_STAGES.map((s, i) => {
                const state = job.stage > i || job.done ? 'done' : job.stage === i ? 'active' : 'todo'
                return (
                  <div key={s.key} className="flex items-start gap-2 text-[13px]">
                    <span className={state === 'done' ? 'text-emerald-400' : state === 'active' ? 'text-amber-400' : 'text-zinc-700'}>
                      {state === 'done' ? '✓' : state === 'active' ? '▸' : '·'}
                    </span>
                    <div>
                      <span className={state === 'todo' ? 'text-zinc-700' : 'text-zinc-200'}>{s.label}</span>
                      {state === 'active' && <span className="ml-2 animate-pulse text-amber-400">running…</span>}
                      <div className="text-[11px] text-zinc-600">{s.detail}</div>
                    </div>
                  </div>
                )
              })}
              {job.done && <div className="mt-2 text-emerald-400">✓ done — upserted {job.chunks} chunks / {job.pages} pages（模拟进度）</div>}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function Chat() {
  const { messages, status, sendMessage } = useStandardsChat()
  const [input, setInput] = useState('')
  const last = [...messages].reverse().find((m) => m.role === 'assistant')

  const submit = () => {
    if (!input.trim()) return
    sendMessage(input)
    setInput('')
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* 左：会话 + 库 */}
      <aside className="w-56 flex-none overflow-y-auto border-r border-zinc-800 p-3 text-sm">
        <button className="mb-3 w-full rounded-md border border-zinc-700 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">+ 新会话</button>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">历史 <span className="normal-case text-zinc-600">（示例数据）</span></div>
        {MOCK_SESSIONS.map((s) => (
          <button key={s.id} className="mb-0.5 block w-full truncate rounded px-2 py-1.5 text-left text-zinc-400 hover:bg-zinc-800">
            <span className="text-zinc-300">{s.title}</span>
            <span className="block truncate text-xs text-zinc-600">{s.when}</span>
          </button>
        ))}
      </aside>

      {/* 中：对话 */}
      <main className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {messages.length === 0 && (
            <div className="mx-auto max-w-lg pt-10">
              <div className="text-sm text-zinc-500">试试这些：</div>
              <div className="mt-2 space-y-1.5">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => sendMessage(s)} className="block w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-left text-sm text-zinc-300 hover:border-emerald-500/50">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[80%] rounded-lg bg-emerald-500/15 px-3 py-2 text-sm text-emerald-100 ring-1 ring-emerald-500/20">{m.content}</div>
              </div>
            ) : (
              <div key={m.id} className="max-w-[85%]">
                <div className="prose-min whitespace-pre-wrap rounded-lg bg-zinc-900 px-3 py-2.5 text-sm text-zinc-200 ring-1 ring-zinc-800">
                  {m.content || <span className="text-zinc-500">检索中…</span>}
                </div>
              </div>
            ),
          )}
        </div>
        <div className="border-t border-zinc-800 p-3">
          <div className="flex items-end gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
              rows={1}
              placeholder="检索国标… (Enter 发送)"
              className="max-h-32 flex-1 resize-none bg-transparent px-1 py-1 text-sm text-zinc-100 outline-none"
            />
            <button onClick={submit} disabled={status !== 'ready' || !input.trim()} className="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-medium text-zinc-950 disabled:opacity-40">发送</button>
          </div>
        </div>
      </main>

      {/* 右：证据面板 */}
      <aside className="w-72 flex-none overflow-y-auto border-l border-zinc-800 bg-zinc-900/40 p-4 text-sm">
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">检索轨迹</div>
        {last && last.trace.length > 0 ? (
          <ul className="mt-2 space-y-1.5 font-mono text-[12px]">
            {last.trace.map((t, i) => (
              <li key={i} className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-zinc-400">{t}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-zinc-600">提问后这里显示库内/联网检索过程。</p>
        )}

        <div className="mt-5 text-xs font-semibold uppercase tracking-wide text-zinc-500">来源引用</div>
        {last && last.sources.length > 0 ? (
          <ul className="mt-2 space-y-1.5">
            {last.sources.map((s, i) => (
              <li key={i} className={`rounded-md border px-2.5 py-2 text-xs ${s.web ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}`}>
                <div className="font-medium">{s.web ? '🌐 联网' : '📑 国标库'}</div>
                <div className="font-mono">{s.code}{s.page ? ` · 第 ${s.page} 页` : ''}</div>
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
