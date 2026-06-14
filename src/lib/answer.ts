// 界面侧的纯逻辑：从 Agent 答案文本判断是否命中废止标准，用于在 UI 上加「已作废」标注。
// Agent 措辞不固定（已作废/作废/废止），这里统一识别。

/** 答案是否提到废止标准（决定界面是否显示「已作废」红标）。 */
export function hasDeprecatedNotice(text: string): boolean {
  return /作废|废止/.test(text)
}
