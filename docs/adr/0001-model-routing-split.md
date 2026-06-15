# 模型路由：LLM（对话 + embedding）统一走 OpenRouter，OCR 单飞 PaddleOCR-VL

对话（`deepseek/deepseek-v4-flash`）和 embedding（`openai/text-embedding-3-small`）都走 OpenRouter，一个 key、统一计费、随时换模型。

> 对话模型从 `openai/gpt-5` 换成 `deepseek/deepseek-v4-flash`：本知识库是「查表取数 + 标来源」，用不上 gpt-5 的深推理。同 Agent 实测（接缝剥离试验步骤）Flash 26s / 2 次检索，gpt-5(effort=low) 36s / 5 次检索；Flash 中文质量、来源引用、废止标注（硬约束⑥）均达标，价格约 gpt-5 的 1/55（$0.09+$0.18 vs $1.25+$10 每百万 token）。注意 DS V4 仅支持 high/xhigh 两档 reasoning，无 low/none，故代码里不设 effort。**embedding 不变**（硬约束③：入库与检索向量空间须一致），换对话模型零迁移、无需重新入库。

> 历史：本 ADR 最初记的是「embedding 必须直连 OpenAI 官方 API，因为 OpenRouter 只代理 chat/completion、不提供 embedding endpoint」，据此把路由拆成两个 key。但 OpenRouter 已于 2025 末/2026 初补上 embedding endpoint（`POST /api/v1/embeddings`，OpenAI 兼容，含 `text-embedding-3-small`），那条平台限制不再成立——于是 embedding 收口到 OpenRouter，原来的「分裂」消失，直连 OpenAI 的那个 key 一并去掉。

OCR 不在此列：扫描件 OCR 走托管的 PaddleOCR-VL API（见 [ADR-0003](0003-ocr-paddleocr-vl.md)），单独一个 key。所以当前共三个 key：LLM（OpenRouter）、OCR（PaddleOCR-VL）、联网（Tavily）。
