// 简单 web UI（#7）：串起混合检索（#4）+ 多轮记忆（#5）+ 联网兜底（#6）。
// 复用已有 standardsAgent，不引前端框架——Node 内置 http 起一个本地服务：
//   GET  /          → 单页对话界面（内联 HTML/CSS/JS）
//   POST /api/chat  → {message, threadId} → 调 Agent，返回 {text, deprecated}
// 同一页面用一个 threadId 贯穿多轮，记忆落在与向量库同一个 libSQL 文件。
//
// 用法：npm run web  然后浏览器开 http://localhost:4111

import 'dotenv/config'
import { createServer } from 'node:http'
import { mastra } from './mastra/index.js'
import { hasDeprecatedNotice } from './lib/answer.js'

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
  .badge { display: inline-block; margin-bottom: 8px; padding: 2px 8px; border-radius: 6px;
           background: #fee2e2; color: #b91c1c; font-size: 12px; font-weight: 600; }
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
<header><h1>防水卷材国标问答 <small>库内优先 · 标来源 · 废止标注 · 多轮记忆</small></h1></header>
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

  function add(role, text, deprecated) {
    const msg = document.createElement('div');
    msg.className = 'msg ' + role;
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    if (deprecated) {
      const b = document.createElement('div');
      b.className = 'badge';
      b.textContent = '⚠ 含已作废标准';
      bubble.appendChild(b);
    }
    bubble.appendChild(document.createTextNode(text));
    msg.appendChild(bubble);
    log.appendChild(msg);
    window.scrollTo(0, document.body.scrollHeight);
    return msg;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = input.value.trim();
    if (!message) return;
    add('user', message);
    input.value = '';
    send.disabled = true;
    const pending = add('bot', '检索中…');
    pending.classList.add('pending');
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, threadId }),
      });
      const data = await res.json();
      pending.remove();
      if (data.error) add('bot', '出错了：' + data.error);
      else add('bot', data.text, data.deprecated);
    } catch (err) {
      pending.remove();
      add('bot', '请求失败：' + err.message);
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

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(PAGE)
    return
  }

  if (req.method === 'POST' && req.url === '/api/chat') {
    try {
      const { message, threadId } = JSON.parse(await readBody(req))
      if (!message || !threadId) throw new Error('缺少 message 或 threadId')
      const result = await agent.generate(message, {
        memory: { thread: threadId, resource: RESOURCE_ID },
      })
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ text: result.text, deprecated: hasDeprecatedNotice(result.text) }))
    } catch (err) {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
    }
    return
  }

  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('Not Found')
})

server.listen(PORT, () => {
  console.log(`[web] 国标问答界面已启动：http://localhost:${PORT}`)
})
