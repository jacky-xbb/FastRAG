// fastrag logo mark：一摞数据行中，被检索出的那一行送进 > caret——「快速命中那一行」。
// 高亮行 + caret 用 currentColor（外部用 text-emerald-400 控制）；其余行 opacity 压暗。
export function Logo({ className = '', size = 24 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <line x1="3" y1="6" x2="10.5" y2="6" opacity="0.35" />
      <line x1="3" y1="18" x2="10.5" y2="18" opacity="0.35" />
      <line x1="3" y1="12" x2="13" y2="12" />
      <polyline points="13.5,7 18.5,12 13.5,17" />
    </svg>
  )
}
