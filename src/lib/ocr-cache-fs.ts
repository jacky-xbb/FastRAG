// 本地 OCR 缓存（Node 专用，CLI 入库兜底 src/ingest.ts 用）：落 ocr_cache/<文件名>.json。
// Workers 入库走 R2 缓存（见 ingest-workflow.ts），两者实现同一个 OcrCache 接口。
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { PageText } from './chunk.js'
import type { OcrCache } from './ingest-pipeline.js'

export const OCR_CACHE_DIR = 'ocr_cache'

export function fsOcrCache(): OcrCache {
  return {
    async get(fileName) {
      const p = join(OCR_CACHE_DIR, `${fileName}.json`)
      if (!existsSync(p)) return null
      return JSON.parse(await readFile(p, 'utf8')) as PageText[]
    },
    async put(fileName, pages) {
      await mkdir(OCR_CACHE_DIR, { recursive: true })
      await writeFile(join(OCR_CACHE_DIR, `${fileName}.json`), JSON.stringify(pages))
    },
  }
}
