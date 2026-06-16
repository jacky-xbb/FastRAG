// 入库页：左侧真资料库（/api/library）+ 右侧上传向量化（/api/ingest，#10/#11）。
import { useIngest } from '../lib/useIngest'
import { useLibrary } from '../lib/useLibrary'
import { INGEST_STAGES } from '../lib/mockData'

export function UploadPage() {
  const { entries, error, refresh } = useLibrary()
  const { job, start, clear } = useIngest(refresh) // 入库完成后刷新资料库列表

  return (
    <div className="flex flex-1 overflow-hidden">
      <section className="w-72 flex-none overflow-y-auto border-r border-zinc-800 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          已入库 {entries && <span className="normal-case text-zinc-600">（{entries.length}）</span>}
        </div>
        {error && <div className="mb-1 rounded-md border border-red-900/60 bg-red-950/40 p-2.5 text-xs text-red-400">加载失败：{error}</div>}
        {!entries && !error && <div className="text-xs text-zinc-600">加载中…</div>}
        {entries && entries.length === 0 && (
          <div className="rounded-md border border-dashed border-zinc-800 p-3 text-xs text-zinc-600">库内暂无标准，右侧上传 PDF 入库。</div>
        )}
        {entries?.map((d) => (
          <div key={d.code} className="mb-1 rounded-md border border-zinc-800 bg-zinc-900 p-2.5 text-sm">
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
          <input type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) start(f); e.target.value = '' }} />
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
              {job.done && <div className="mt-2 text-emerald-400">✓ done — upserted {job.chunks} chunks / {job.pages} pages</div>}
              {job.error && <div className="mt-2 text-red-400">✗ 入库失败：{job.error}</div>}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
