// 本地 OCR 缓存（Node 专用，CLI 入库 src/ingest.ts 与 fly 进程内入库都用）：落 ocr_cache/<文件名>.json。
// 实现 ingest-pipeline 的 OcrCache 接口。
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { PageText } from './chunk.js'
import type { OcrCache } from './ingest-pipeline.js'

export const OCR_CACHE_DIR = 'ocr_cache'

/** baseDir 默认 OCR_CACHE_DIR（CLI 在 cwd 下）；Node/fly.io 入口传 ${DATA_DIR}/ocr_cache 落卷。 */
export function fsOcrCache(baseDir: string = OCR_CACHE_DIR): OcrCache {
  return {
    async get(fileName) {
      const p = join(baseDir, `${fileName}.json`)
      if (!existsSync(p)) return null
      return JSON.parse(await readFile(p, 'utf8')) as PageText[]
    },
    async put(fileName, pages) {
      await mkdir(baseDir, { recursive: true })
      await writeFile(join(baseDir, `${fileName}.json`), JSON.stringify(pages))
    },
  }
}
