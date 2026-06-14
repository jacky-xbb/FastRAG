// 入库脚本：PDF → 指标行切块（ADR-0004） → embedMany(OpenRouter) → upsert 到 libSQL。
// 表格扫描件走 PaddleOCR-VL（带本地缓存），有文字层的走 unpdf。两条路都过 chunkOcrPages，
// 每块带元数据 {标准号, 表名, 指标名, 页码, 状态}；废止标准（文件名含「作废」）状态=废止。
//
// 用法：
//   npm run ingest                          # 默认入库 GBT 18242-2025（有文字层）
//   npm run ingest -- "pdf/xxx.pdf"         # 入库指定 PDF（有文字层）
//   npm run ingest -- --ocr "pdf/xxx.pdf"   # 扫描件：OCR（缓存到 ocr_cache/）后入库
//   npm run ingest -- --all                 # 全量：pdf/ 下全部，18242 走文字层，其余走 OCR
//   npm run ingest -- --all --plan          # 只预演：列出哪些走付费 OCR，不入库、不扣费
//
// 全量重建前建议先删 vector.db（会一并清掉会话历史，见 #5）。

import 'dotenv/config'
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import { embedMany } from 'ai'
import { extractPages } from './lib/pdf.js'
import { ocrPdfToPages } from './lib/ocr.js'
import { chunkOcrPages, type IndicatorChunk } from './lib/indicator-chunk.js'
import { planIngest, summarizePlan } from './lib/ingest-plan.js'
import type { PageText } from './lib/chunk.js'
import { embedModel, EMBED_DIMENSION, INDEX_NAME } from './lib/openrouter.js'
import { libsqlVector } from './mastra/index.js'

const DEFAULT_PDF = 'pdf/GBT 18242-2025 弹性体塑性体改性沥青防水卷材.pdf'
const PDF_DIR = 'pdf'
const OCR_CACHE_DIR = 'ocr_cache'
// 唯一有文字层的标准，其余 17 份均为扫描件（走 OCR）。
const TEXT_LAYER_PDF = 'GBT 18242-2025 弹性体塑性体改性沥青防水卷材.pdf'
const EMBED_BATCH = 256

/** OCR 结果缓存到 ocr_cache/<basename>.json：OCR ~30s/份且结果 URL 仅 7 天，缓存后重跑免费。 */
async function cachedOcrPages(pdfPath: string): Promise<PageText[]> {
  await mkdir(OCR_CACHE_DIR, { recursive: true })
  const cachePath = join(OCR_CACHE_DIR, `${basename(pdfPath)}.json`)
  if (existsSync(cachePath)) {
    console.log(`[ingest] 命中 OCR 缓存 ${cachePath}`)
    return JSON.parse(await readFile(cachePath, 'utf8')) as PageText[]
  }
  const pages = await ocrPdfToPages(pdfPath)
  await writeFile(cachePath, JSON.stringify(pages))
  console.log(`[ingest] OCR 结果已缓存到 ${cachePath}`)
  return pages
}

/** 单份 PDF → 指标行块。ocr=true 走 PaddleOCR-VL（缓存），否则走文字层抽取。 */
async function chunkOne(pdfPath: string, ocr: boolean): Promise<IndicatorChunk[]> {
  const fileName = basename(pdfPath)
  console.log(`[ingest] ${ocr ? 'OCR' : '文字层'} 读取 ${pdfPath}`)
  const pages = ocr ? await cachedOcrPages(pdfPath) : await extractPages(pdfPath)
  const records = chunkOcrPages(pages, { fileName, size: 800, overlap: 100 })
  const tableChunks = records.filter((r) => r.metadata.指标名).length
  console.log(
    `[ingest] ${fileName}：${pages.length} 页 → ${records.length} 块（含 ${tableChunks} 指标行）`,
  )
  return records
}

/**
 * 把一份标准的块算向量后 upsert（分批，避免单次 embed 输入过多）。
 * id 用 `${文件名}#${序号}` 稳定标识：同份标准重跑 --all 时按 id 覆盖、不重复入库，
 * 故失败份补跑后无须先删库（OCR 缓存 + id 幂等 = 真·增量续跑）。
 */
async function upsertRecords(records: IndicatorChunk[]) {
  for (let i = 0; i < records.length; i += EMBED_BATCH) {
    const batch = records.slice(i, i + EMBED_BATCH)
    const { embeddings } = await embedMany({ model: embedModel, values: batch.map((r) => r.text) })
    // metadata 带上 text，检索时 Agent 才读得到原文并据此引用来源。
    await libsqlVector.upsert({
      indexName: INDEX_NAME,
      vectors: embeddings,
      metadata: batch.map((r) => ({ text: r.text, ...r.metadata })),
      ids: batch.map((r, j) => `${r.metadata.fileName}#${i + j}`),
    })
  }
}

async function main() {
  const args = process.argv.slice(2)
  await libsqlVector.createIndex({ indexName: INDEX_NAME, dimension: EMBED_DIMENSION })

  if (args.includes('--all')) {
    const files = (await readdir(PDF_DIR)).filter((f) => /\.pdf$/i.test(f)).sort()

    // 预演计划：先按 文字层/缓存/付费OCR 分类，让真扣费的 paid-ocr 在动手前一目了然。
    await mkdir(OCR_CACHE_DIR, { recursive: true })
    const cachedFiles = new Set(
      (existsSync(OCR_CACHE_DIR) ? await readdir(OCR_CACHE_DIR) : [])
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.slice(0, -'.json'.length)),
    )
    const plan = planIngest(files, { textLayerPdf: TEXT_LAYER_PDF, cachedFiles })
    const counts = summarizePlan(plan)
    console.log(
      `[ingest] 计划：共 ${counts.total} 份｜文字层 ${counts['text-layer']}｜缓存 ${counts.cached}｜付费 OCR ${counts['paid-ocr']}`,
    )
    const MODE_LABEL = { 'text-layer': '文字层', cached: '缓存  ', 'paid-ocr': '付费OCR' } as const
    for (const { file, mode } of plan) console.log(`  [${MODE_LABEL[mode]}] ${file}`)
    if (args.includes('--plan')) {
      console.log(`[ingest] --plan 仅预演，未入库、未触发 OCR。去掉 --plan 即执行。`)
      return
    }

    console.log(`[ingest] 全量入库 ${files.length} 份标准`)
    const failed: string[] = []
    let okCount = 0
    let totalChunks = 0
    // 逐份 OCR→切块→入库：单份失败（如 PaddleOCR 限流「队列已满」）只跳过该份并续跑，
    // 已入库的份不回滚；补跑 --all 时 OCR 缓存命中 + id 幂等覆盖，不重复付费/不重复入库。
    for (const f of files) {
      try {
        const records = await chunkOne(join(PDF_DIR, f), f !== TEXT_LAYER_PDF)
        await upsertRecords(records)
        okCount++
        totalChunks += records.length
      } catch (err) {
        console.error(`[ingest] ✗ 跳过 ${f}：${(err as Error).message}`)
        failed.push(f)
      }
    }
    console.log(`[ingest] 全量完成：成功 ${okCount}/${files.length} 份，共 ${totalChunks} 块`)
    if (failed.length) {
      console.log(`[ingest] 失败 ${failed.length} 份（重跑 npm run ingest -- --all 增量续跑）：`)
      for (const f of failed) console.log(`  - ${f}`)
    }
    return
  }

  const ocr = args.includes('--ocr')
  const pdfPath = args.find((a) => !a.startsWith('--')) ?? DEFAULT_PDF
  const records = await chunkOne(pdfPath, ocr)
  await upsertRecords(records)
  console.log(`[ingest] 完成：${records.length} 块已入库到索引 "${INDEX_NAME}"`)
}

main().catch((err) => {
  console.error('[ingest] 失败：', err)
  process.exit(1)
})
