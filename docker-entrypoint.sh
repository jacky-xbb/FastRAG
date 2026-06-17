#!/bin/sh
# 首启准备：建数据目录；若卷上还没有 vector.db，则从镜像内的 /app/seed 拷一份种子库过去。
# 卷持久，重部署不会覆盖已有库（升级镜像不丢数据 / 不丢已上传 PDF）。
set -e

mkdir -p "${DATA_DIR:-/data}/pdf" "${DATA_DIR:-/data}/ocr_cache" "${DATA_DIR:-/data}/ingest_status"

if [ ! -f "${DATA_DIR:-/data}/vector.db" ] && [ -f /app/seed/vector.db ]; then
  echo "[entrypoint] 首启：拷贝种子库 /app/seed/vector.db → ${DATA_DIR:-/data}/vector.db"
  cp /app/seed/vector.db "${DATA_DIR:-/data}/vector.db"
fi

exec "$@"
