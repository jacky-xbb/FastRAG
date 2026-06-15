// 简单 web UI（#7）：串起混合检索（#4）+ 多轮记忆（#5）+ 联网兜底（#6）。
// 复用已有 standardsAgent，不引前端框架——Node 内置 http 起一个本地服务：
//   GET  /          → 单页对话界面（内联 HTML/CSS/JS）
//   POST /api/chat  → {message, threadId} → 调 Agent，返回流式答案
// 同一页面用一个 threadId 贯穿多轮，记忆落在与向量库同一个 libSQL 文件。
//
// 用法：npm run web  然后浏览器开 http://localhost:4111

import 'dotenv/config'
import { createServer } from 'node:http'
import { mastra, GENERATE_MAX_STEPS } from './mastra/index.js'

const PORT = Number(process.env.PORT) || 4111
const RESOURCE_ID = 'web-user'

const PAGE = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>防水卷材国标问答</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { font: 15px/1.6 system-ui, sans-serif; margin: 0; background: #f5f6f8; color: #1a1a1a; }
  header { padding: 14px 20px; background: #1f2937; color: #fff; }
  header h1 { margin: 0; font-size: 16px; }
  header small { color: #9ca3af; }
  #log { max-width: 760px; margin: 0 auto; padding: 20px 16px 120px; }
  .msg { margin: 14px 0; display: flex; }
  .msg.user { justify-content: flex-end; }
  .bubble { max-width: 88%; padding: 10px 14px; border-radius: 12px; white-space: pre-wrap; word-break: break-word; }
  .user .bubble { background: #2563eb; color: #fff; border-bottom-right-radius: 2px; }
  .bot .bubble { background: #fff; border: 1px solid #e5e7eb; border-bottom-left-radius: 2px; }
  .pending .bubble { color: #6b7280; font-style: italic; }
  form { position: fixed; bottom: 0; left: 0; right: 0; background: #f5f6f8;
         border-top: 1px solid #e5e7eb; padding: 12px; }
  .row { max-width: 760px; margin: 0 auto; display: flex; gap: 8px; }
  input { flex: 1; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font: inherit; }
  button { padding: 10px 18px; border: 0; border-radius: 8px; background: #2563eb; color: #fff; font: inherit; cursor: pointer; }
  button:disabled { opacity: .5; cursor: default; }
</style>
</head>
<body>
<header><h1>防水卷材国标问答 <small>库内优先 · 标来源 · 多轮记忆</small></h1></header>
<div id="log"></div>
<form id="f"><div class="row">
  <input id="q" placeholder="如：GBT 18242-2025 中 I 型卷材的可溶物含量要求是多少？" autocomplete="off" autofocus />
  <button id="send" type="submit">发送</button>
</div></form>
<script>
  // 同一页面共用一个 threadId，多轮可互相引用（记忆）。
  const threadId = 'web-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random());
  const log = document.getElementById('log');
  const form = document.getElementById('f');
  const input = document.getElementById('q');
  const send = document.getElementById('send');

  // 建一个气泡，返回里面的文本容器（用于流式增量写入）。
  function addBubble(role) {
    const msg = document.createElement('div');
    msg.className = 'msg ' + role;
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    msg.appendChild(bubble);
    log.appendChild(msg);
    window.scrollTo(0, document.body.scrollHeight);
    return { msg, bubble };
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = input.value.trim();
    if (!message) return;
    addBubble('user').bubble.textContent = message;
    input.value = '';
    send.disabled = true;

    const { msg, bubble } = addBubble('bot');
    msg.classList.add('pending');
    bubble.textContent = '检索中…';
    let acc = '';
    let started = false;
    const statusLines = [];

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, threadId }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({ error: 'HTTP ' + res.status }));
        msg.classList.remove('pending');
        bubble.textContent = '出错了：' + (data.error || res.status);
        return;
      }
      // 解析 SSE：每个事件是一行 data: {...}\\n\\n。
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\\n\\n');
        buf = parts.pop();
        for (const part of parts) {
          const line = part.replace(/^data: /, '').trim();
          if (!line) continue;
          let evt;
          try { evt = JSON.parse(line); } catch (_) { continue; }
          if (evt.status != null) {
            // 检索进度：答案还没开始时，逐条显示「正在检索什么」，让等待不再是死状态。
            if (!started) {
              statusLines.push(evt.status);
              bubble.textContent = statusLines.join('\\n');
              window.scrollTo(0, document.body.scrollHeight);
            }
          } else if (evt.delta != null) {
            if (!started) { started = true; msg.classList.remove('pending'); bubble.textContent = ''; }
            acc += evt.delta;
            bubble.textContent = acc;
            window.scrollTo(0, document.body.scrollHeight);
          } else if (evt.error) {
            msg.classList.remove('pending');
            bubble.textContent = '出错了：' + evt.error;
          }
        }
      }
    } catch (err) {
      msg.classList.remove('pending');
      bubble.textContent = '请求失败：' + err.message;
    } finally {
      send.disabled = false;
      input.focus();
    }
  });
</script>
</body>
</html>`

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
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(PAGE)
    return
  }

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

  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('Not Found')
})

server.listen(PORT, () => {
  console.log(`[web] 国标问答界面已启动：http://localhost:${PORT}`)
})
