#!/usr/bin/env bash
# 表外正文切法对比：fixed（基线，自家定长切）vs markdown（候选，Mastra 结构感知切）。
# 各自建独立库灌全量，再跑 --prose 评测，并排打印「正文召回」，不碰现状 vector.db。
#
# 安全：向量 + BM25 都读 VECTOR_DB_URL 那个库（corpus.ts），设一个变量即整条链路隔离。
# 成本：OCR 缓存命中→免费；但 embedding 不缓存，会按块数对 OpenAI text-embedding-3-small
#       计费两轮（fixed + markdown）。模型便宜，可接受；介意就先 export PDF 子集到 pdf/。
#
# 用法：bash scripts/compare-prose.sh            # 默认正文块 1500
#       PROSE_MAX_SIZE=2000 bash scripts/compare-prose.sh   # 试更大块
set -euo pipefail
cd "$(dirname "$0")/.."

run() {
  local mode=$1 db="file:./vector-$1.db"
  echo
  echo "================  PROSE_MODE=$mode  (库 $db)  ================"
  echo "[compare] 灌全量 17 份（OCR 缓存命中则免费，仅 embedding 计费）..."
  PROSE_MODE="$mode" VECTOR_DB_URL="$db" npx tsx src/ingest.ts --all
  echo
  echo "----------------  $mode · --prose 正文召回  ----------------"
  PROSE_MODE="$mode" VECTOR_DB_URL="$db" npx tsx test/eval.ts --prose
}

run fixed
run markdown

echo
echo "================  对比完成  ================"
echo "比两段「正文召回 · Recall@K」的命中率，高者胜。"
echo "临时库：vector-fixed.db / vector-markdown.db（看完可删：rm vector-fixed.db vector-markdown.db）。"
