# 部署到 fly.io（常驻 Node 进程 + 本地卷 libSQL）运维手册

选型与取舍见 [ADR-0010](adr/0010-deploy-fly-local-volume.md)。本文是一次性落地的操作步骤。
与 Cloudflare 部署（[docs/部署-cloudflare.md](部署-cloudflare.md)）**并存**，互不影响。

## 前置

- fly.io 账号；安装 flyctl：`curl -L https://fly.io/install.sh | sh`，`fly auth login`。
- 本机 Docker（本地验证镜像用，可选）。
- 本机已能跑通本地版（`.env` 里各 key 齐全），`pdf/` 与 `ocr_cache/` 在位（重灌种子库免 OCR）。

## 1. 生成瘦种子库（本地，一次性）

> [ADR-0009](adr/0009-drop-vector-index-bruteforce.md) 去 DiskANN 后，旧 `vector.db` 膨胀（索引 shadow 表）`VACUUM` 删不掉，故用新代码重灌出无索引瘦库。
> ⚠️ `rm vector.db*` 会一并清掉本地会话历史（线上数据在各自的库里，不受影响）。

```bash
rm -f vector.db vector.db-shm vector.db-wal
npm run ingest -- --all          # OCR 命中 ocr_cache → 免费免重跑；产出 ~19M 无索引库
sqlite3 vector.db "PRAGMA wal_checkpoint(TRUNCATE);"   # 把 WAL 落盘，确保单文件完整
ls -lh vector.db                  # 确认 ~19M（而非 595M）
```

## 2. 本地验证镜像（可选，但推荐）

```bash
docker build -t fastrag .
docker run --rm -p 8080:8080 --env-file .env \
  -e DATA_DIR=/data -e VECTOR_DB_URL=file:/data/vector.db \
  -v "$PWD/.flydata:/data" fastrag
# 另开终端：开 http://localhost:8080 → 登录 → 问一条已知指标 → 上传一份 PDF 看进度走到 done
```

> 注：`.env` 里若含 `TURSO_*`，容器会优先连 Turso 而非本地卷。本地验证「文件库」路径时，临时用一个不含 `TURSO_*` 的 env 文件，或确认 `VECTOR_DB_URL` 生效（线上靠 secrets 不含 TURSO，天然走文件库）。

## 3. 创建 app 与卷

```bash
fly launch --no-deploy            # 按提示选 app 名/region（已有 fly.toml，确认沿用）
fly volumes create fastrag_data --region sin --size 1   # 与 fly.toml 的 mounts.source 同名
```

## 4. 配 secrets（不含 TURSO_*，故走本地卷文件库）

```bash
fly secrets set \
  OPENROUTER_API_KEY=… \
  PADDLE_API_KEY=… \
  TAVILY_API_KEY=… \
  ADMIN_USER=… \
  ADMIN_PASSWORD=… \
  SESSION_SECRET=…
```

> `DATA_DIR` / `VECTOR_DB_URL` / `PORT` 已在 `fly.toml` 的 `[env]`，无须 secret。

## 5. 部署

```bash
fly deploy                        # 构建镜像（含瘦库种子）→ 首启 entrypoint 拷库到 /data
fly logs                          # 看启动日志与入库阶段
fly open                          # 浏览器打开
```

## 6. 线上验证

- 登录（ADMIN_*）→ 问一条已知指标（如 GB/T 18242 耐热性）→ 答案带来源页码。
- 上传一份新 PDF → 轮询进度 `ocr→chunk→embed→done` → 入库后能检索到。
- `fly apps restart fastrag` 后库与已传 PDF 仍在（卷持久）。

## 备份（单卷无副本，务必做）

```bash
fly volumes snapshots list <volume-id>     # fly 自动快照
# 或定时把库拉下来：
fly ssh console -C "sqlite3 /data/vector.db \".backup /data/backup.db\""
fly sftp get /data/backup.db ./backup-$(date +%F).db
```

## 升级镜像不丢数据

重新 `fly deploy` 只换镜像；`/data` 卷持久，entrypoint 见库已存在不覆盖。要换库时手动 `fly sftp put` 新库或进 console 替换。
