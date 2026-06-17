// fs 版「R2 桶」（Node/fly.io 入口用）：把对象 key 落到本地 ${DATA_DIR}/<key>。
// 只实现 app.ts 的 AppEnv.BUCKET 用到的 put/get 子集，结构对齐 R2，故 handleIngest 等零改动。
// key 形如 pdf/<名>.pdf、ingest_status/<uuid>.json，均已在上游清洗（safePdfName / randomUUID）。
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import type { AppEnv } from '../app.js'

export const DATA_DIR = process.env.DATA_DIR ?? '.'

// 防目录穿越：解析后的绝对路径必须仍在 DATA_DIR 内。
function safePath(key: string): string {
  const root = resolve(DATA_DIR)
  const p = resolve(root, key)
  if (p !== root && !p.startsWith(root + sep)) throw new Error(`非法对象 key：${key}`)
  return p
}

export function fsBucket(): AppEnv['BUCKET'] {
  return {
    async put(key, value) {
      const p = safePath(key)
      await mkdir(dirname(p), { recursive: true })
      await writeFile(p, typeof value === 'string' ? value : Buffer.from(value))
    },
    async get(key) {
      const p = safePath(key)
      if (!existsSync(p)) return null
      return {
        async text() {
          return readFile(p, 'utf8')
        },
        async arrayBuffer() {
          const buf = await readFile(p)
          return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
        },
      }
    },
  }
}
