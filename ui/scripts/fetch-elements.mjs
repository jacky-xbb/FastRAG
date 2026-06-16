// 从官方 registry 把 ai-elements 组件 + 依赖的 shadcn 原语递归拉成源码。
// 走这条而非交互式 `npx ai-elements@latest`：本环境无终端、向导会挂起；结果等价（官方原版源码）。
// 用法：node ui/scripts/fetch-elements.mjs  （Node 22+，内置 fetch）
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const UI_DIR = join(dirname(fileURLToPath(import.meta.url)), '..') // ui/
const SRC = join(UI_DIR, 'src')

const AI = (n) => `https://registry.ai-sdk.dev/${n}.json`
const SH = (n) => `https://ui.shadcn.com/r/styles/default/${n}.json`

// 想要的 ai-elements 组件（对话列 + 证据面板用到的）
const SEEDS = [
  'conversation', 'message', 'prompt-input',
  'sources', 'tool', 'loader', 'suggestion',
]

// registry 内部别名 → 本项目别名（CLI 平时会做这步重写，我们绕过 CLI 自己来）
function rewriteImports(content) {
  return content
    .replaceAll('@/registry/default/ui/', '@/components/ui/')
    .replaceAll('@/registry/default/ai-elements/', '@/components/ai-elements/')
    .replaceAll('@/registry/default/lib/', '@/lib/')
    .replaceAll('@/registry/default/hooks/', '@/hooks/')
}

// registry 文件路径 → 落地到 ui/src 下的相对路径
function mapPath(p) {
  // ai-elements: registry/default/ai-elements/x.tsx
  let m = p.match(/ai-elements\/(.+)$/)
  if (m) return join('components', 'ai-elements', m[1])
  // shadcn ui: ui/x.tsx
  m = p.match(/(?:^|\/)ui\/(.+)$/)
  if (m) return join('components', 'ui', m[1])
  m = p.match(/(?:^|\/)lib\/(.+)$/)
  if (m) return join('lib', m[1])
  m = p.match(/(?:^|\/)hooks\/(.+)$/)
  if (m) return join('hooks', m[1])
  return join('components', 'ui', basename(p))
}

const npmDeps = new Set()
const visited = new Set()
const queue = SEEDS.map(AI)
let written = 0

async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const j = await res.json()
  if (j.error) throw new Error(j.error)
  return j
}

while (queue.length) {
  const url = queue.shift()
  if (visited.has(url)) continue
  visited.add(url)
  let item
  try {
    item = await fetchJson(url)
  } catch (e) {
    console.warn(`! 跳过 ${url}：${e.message}`)
    continue
  }
  for (const d of item.dependencies ?? []) npmDeps.add(d)
  for (const f of item.files ?? []) {
    if (f.content == null) continue
    const rel = mapPath(f.path)
    const dest = join(SRC, rel)
    await mkdir(dirname(dest), { recursive: true })
    await writeFile(dest, rewriteImports(f.content))
    written++
  }
  for (const r of item.registryDependencies ?? []) {
    queue.push(r.startsWith('http') ? r : SH(r))
  }
}

console.log(`\n✓ 写入 ${written} 个文件，覆盖 ${visited.size} 个 registry 条目`)
console.log(`\nnpm 依赖（装到 root）：\n${[...npmDeps].sort().join(' ')}`)
