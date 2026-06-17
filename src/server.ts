// Node/fly.io 入口：常驻进程托管 API + 前端静态资源。路由逻辑全在 src/app.ts 共享（与 Cloudflare 同一套）。
// 自带一个轻量 node:http ↔ Web fetch 适配器（不引框架，沿用旧 src/web.ts 的 node:http 形态）：
// 把 IncomingMessage 转成 Web Request 交给 app.ts，再把返回的 Web Response 流式写回（支持 SSE）。
// 对象存储/入库任务/静态资源用本地实现（fs-bucket / ingest-runner / serveStatic）注入 AppEnv。
// 数据全落 ${DATA_DIR}（fly volume）。
import 'dotenv/config'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { dispatch, type AppEnv } from './app.js'
import { fsBucket } from './lib/fs-bucket.js'
import { createIngestRunner } from './lib/ingest-runner.js'

const PORT = Number(process.env.PORT) || 8080
const DIST = resolve('ui/dist')

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
}

// 前端静态资源（读 ui/dist）：SPA 未命中回退 index.html，带 MIME 与目录穿越防护。
async function serveStatic(req: Request): Promise<Response> {
  if (!existsSync(join(DIST, 'index.html'))) {
    return new Response('<h1>前端尚未构建</h1><p>先跑 <code>npm run ui:build</code></p>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }
  const pathname = decodeURIComponent(new URL(req.url).pathname)
  let filePath = resolve(DIST, '.' + normalize(pathname))
  const inDist = filePath === DIST || filePath.startsWith(DIST + sep)
  // 越界、根路径、文件不存在 → 一律回 index.html（SPA 路由）。
  if (!inDist || pathname === '/' || !existsSync(filePath) || filePath === DIST) {
    filePath = join(DIST, 'index.html')
  }
  const data = await readFile(filePath)
  return new Response(new Uint8Array(data), {
    status: 200,
    headers: { 'content-type': MIME[extname(filePath)] ?? 'application/octet-stream' },
  })
}

// node IncomingMessage → Web Request。
function toRequest(req: IncomingMessage): Request {
  const url = `http://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) for (const x of v) headers.append(k, x)
    else if (v != null) headers.set(k, v)
  }
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
  return new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? (Readable.toWeb(req) as unknown as ReadableStream) : undefined,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' })
}

// Web Response → node ServerResponse（流式写回，支持 SSE 增量刷出）。
function sendResponse(res: ServerResponse, response: Response): void {
  const headers: Record<string, string | string[]> = {}
  response.headers.forEach((value, key) => {
    headers[key] = value
  })
  // set-cookie 不能被逗号合并，单独取多值。
  const setCookie = (response.headers as Headers & { getSetCookie?(): string[] }).getSetCookie?.()
  if (setCookie?.length) headers['set-cookie'] = setCookie
  res.writeHead(response.status, headers)
  if (!response.body) {
    res.end()
    return
  }
  Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res)
}

const bucket = fsBucket()
const env: AppEnv = {
  BUCKET: bucket,
  INGEST_WORKFLOW: createIngestRunner(bucket),
  ASSETS: { fetch: serveStatic },
}

createServer((req, res) => {
  dispatch(toRequest(req), env)
    .then((response) => sendResponse(res, response))
    .catch((err) => {
      console.error('[server] 请求出错:', err)
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
    })
}).listen(PORT, () => {
  console.log(`[server] 国标问答服务已启动：http://localhost:${PORT}（DATA_DIR=${process.env.DATA_DIR ?? '.'}）`)
})
