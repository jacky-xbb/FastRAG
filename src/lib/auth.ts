// 单管理员鉴权（ADR-0007）：.env 明文凭据 + httpOnly 签名 Cookie。
// 令牌 stateless：`payload.签名`，签名 = HMAC(SESSION_SECRET, payload)，服务端无需存会话。
import { createHmac, timingSafeEqual } from 'node:crypto'

const COOKIE_NAME = 'fastrag_session'
const MAX_AGE = 60 * 60 * 24 * 30 // 30 天

const ADMIN_USER = process.env.ADMIN_USER ?? ''
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? ''
const SESSION_SECRET = process.env.SESSION_SECRET ?? ''

/** 鉴权是否已配置（缺任一则视为未配置，登录端点据此明确报错而非放行）。 */
export function authConfigured(): boolean {
  return Boolean(ADMIN_USER && ADMIN_PASSWORD && SESSION_SECRET)
}

/** 常量时间字符串比较，避免计时侧信道。 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

export function checkCredentials(user: string, password: string): boolean {
  return safeEqual(user, ADMIN_USER) && safeEqual(password, ADMIN_PASSWORD)
}

function sign(payload: string): string {
  return createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url')
}

/** 签发令牌：payload 含签发时间，用于过期判断。 */
export function issueToken(): string {
  const payload = Buffer.from(JSON.stringify({ u: ADMIN_USER, t: Date.now() })).toString('base64url')
  return `${payload}.${sign(payload)}`
}

/** 校验令牌：签名对得上且未过期，返回用户名；否则 null。 */
export function verifyToken(token: string | undefined): string | null {
  if (!token) return null
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  if (!safeEqual(sig, sign(payload))) return null
  try {
    const { u, t } = JSON.parse(Buffer.from(payload, 'base64url').toString())
    if (typeof t !== 'number' || Date.now() - t > MAX_AGE * 1000) return null
    return typeof u === 'string' ? u : null
  } catch {
    return null
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

/** 从请求里取已验证的用户名（未登录返回 null）。 */
export function authedUser(req: import('node:http').IncomingMessage): string | null {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME]
  return verifyToken(token)
}

export function sessionCookie(token: string): string {
  return `${COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${MAX_AGE}`
}

export function clearedCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`
}
