// 后端服务：API + 托管前端（#7）。串起混合检索（#4）+ 多轮记忆（#5）+ 联网兜底（#6）。
// 复用已有 standardsAgent，Node 内置 http：
//   POST /api/chat  → {message, threadId} → 调 Agent，返回流式答案（SSE）
//   GET  /*         → 托管 ui/dist 的静态前端（SPA，未构建时给提示）
// 前端代码在 ui/（Vite + React，专业暗色三栏工作台）。
//   开发：npm run dev（本服务 :4111 + Vite :5173，/api 由 Vite 代理过来）
//   生产：npm run ui:build 出 ui/dist，再 npm run web，本页直接托管
// 同一会话用一个 threadId 贯穿多轮，记忆落在与向量库同一个 libSQL 文件。

import 'dotenv/config'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, extname, normalize } from 'node:path'
import { mastra, GENERATE_MAX_STEPS } from './mastra/index.js'

const PORT = Number(process.env.PORT) || 4111
const RESOURCE_ID = 'web-user'

const DIST = join(process.cwd(), 'ui', 'dist')
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
}

// 托管 ui/dist；找不到具体文件时回退 index.html（SPA）。未构建时给一句提示。
async function serveStatic(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) {
  if (!existsSync(join(DIST, 'index.html'))) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end('<h1>前端尚未构建</h1><p>开发：<code>npm run dev</code>（Vite :5173）。<br>生产：<code>npm run ui:build</code> 后再访问本页。</p>')
    return
  }
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0])
  let filePath = join(DIST, normalize(urlPath))
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }
  if (urlPath === '/' || !existsSync(filePath)) filePath = join(DIST, 'index.html')
  try {
    const data = await readFile(filePath)
    res.writeHead(200, { 'content-type': MIME[extname(filePath)] ?? 'application/octet-stream' })
    res.end(data)
  } catch {
    res.writeHead(404)
    res.end('Not Found')
  }
}

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (c) => (data += c))
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

const agent = mastra.getAgent('standardsAgent')

// 把一次工具调用变成一句给用户看的检索进度（检索阶段无文本可流，用它撑住等待体验）。
function toolLabel(payload: any): string {
  const a = payload?.args ?? {}
  if (payload?.toolName === 'webSearchTool') return `🌐 联网搜索：${a.query ?? ''}`
  const term = a.standardCode || a.indicator || a.table || (a.query ? String(a.query).slice(0, 18) : '')
  return `🔍 检索国标库：${term}`
}

const server = createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/chat') {
    const t0 = Date.now()
    let q = ''
    const sse = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`)
    try {
      const { message, threadId } = JSON.parse(await readBody(req))
      if (!message || !threadId) throw new Error('缺少 message 或 threadId')
      q = message
      const stream = await agent.stream(message, {
        memory: { thread: threadId, resource: RESOURCE_ID },
        maxSteps: GENERATE_MAX_STEPS,
      })
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      })
      // 遍历 fullStream：工具检索阶段无文本可流，改推「检索进度」让等待不再是死状态；
      // 文本增量（text-delta）照常流；finish 事件带最终 finishReason 用于日志。
      let full = ''
      let finishReason = '?'
      for await (const chunk of stream.fullStream as AsyncIterable<any>) {
        if (chunk.type === 'text-delta') {
          const t = chunk.payload?.text ?? ''
          full += t
          sse({ delta: t })
        } else if (chunk.type === 'tool-call') {
          sse({ status: toolLabel(chunk.payload) })
        } else if (chunk.type === 'finish') {
          finishReason = chunk.payload?.stepResult?.reason ?? finishReason
        }
      }
      // 检索步数用尽时 text 为空，补一句兜底文案，别让界面留空气泡。
      if (!full.trim()) {
        full = '这次没能整理出答案（检索步数可能用尽）。把问题问得更具体些，或再试一次。'
        sse({ delta: full })
      }
      sse({ done: true })
      res.end()
      console.log(`[chat] ${Date.now() - t0}ms finish=${finishReason} len=${full.length} q=${JSON.stringify(message)}`)
    } catch (err) {
      console.error(`[chat] ${Date.now() - t0}ms 出错 q=${JSON.stringify(q)}:`, err)
      const msg = err instanceof Error ? err.message : String(err)
      if (res.headersSent) {
        sse({ error: msg })
        res.end()
      } else {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: msg }))
      }
    }
    return
  }

  if (req.method === 'GET') {
    await serveStatic(req, res)
    return
  }

  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('Not Found')
})

server.listen(PORT, () => {
  console.log(`[web] 国标问答服务已启动：http://localhost:${PORT}`)
})
