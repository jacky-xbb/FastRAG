# 单管理员鉴权：.env 明文凭据 + httpOnly 签名 Cookie

Web 应用从「裸奔无鉴权」改为**登录后才能用**。刻意做成**单管理员**：凭据在 `.env`（`ADMIN_USER` / `ADMIN_PASSWORD` 明文 + `SESSION_SECRET`），登录后发一个 **httpOnly 签名 Cookie**（HMAC over SESSION_SECRET，stateless），所有 `/api/*` 校验它。前端用 React Router，受保护路由套守卫。

## 决策

1. **单管理员、无用户系统**。没有用户表、没有注册、没有多租户。一组管理员凭据存 `.env`（`ADMIN_USER` / `ADMIN_PASSWORD` **明文**，常量时间比较）。这是本地私有工具的合理简化。
2. **httpOnly 签名 Cookie**。`POST /api/login` 校验凭据后 `Set-Cookie`，值是 `HMAC(SESSION_SECRET, …)` 的 stateless 令牌（无需服务端存会话）。SameSite=Lax、Path=/、~30 天。同源请求自动带，**前端所有 fetch / SSE / useChat 零改动**，且 JS 读不到（抗 XSS）。
3. **锁整个应用**。所有 `/api/*`（chat/ingest/library/threads/messages）校验 cookie，无效返 401。静态资源（SPA 外壳）公开，以便加载登录页。新增 `GET /api/me`（验证态）、`POST /api/logout`（清 cookie）。
4. **前端守卫 + 路由**。React Router：`/login`（公开）、`/chat`、`/chat/:threadId`、`/upload`。加载时调 `/api/me` 判断登录态；任何 API 返 401 → 跳 `/login`。

## 理由 / 被否方案

- **为何单 admin + .env 明文**：本地单人工具，引入用户表/注册/哈希库是过度工程。`.env` 本就是密钥库（已 gitignore），明文够用。**明确不做多用户**——日后真要多人，再单独立项改造，别现在背复杂度。
- **为何 cookie 而非 localStorage + Bearer**：bearer 要给每条 fetch（含 useChat transport、library/threads/ingest、SSE）手动塞 Authorization，4+ 处易漏；httpOnly cookie 同源自动带、零散落、且抗 XSS。代价是裸 http server 多写 cookie 读写 + HMAC 签验，认这个代价。
- **为何 stateless HMAC 而非服务端会话表**：单 admin 无需会话存储/失效列表；签名令牌自验证，重启不掉登录。

## 影响

- `.env` 新增 3 个键（见 `.env.example`）；缺失时登录端点应明确报错，而非裸奔放行。
- 路由结构属常规，不单独立 ADR；`/chat/:threadId` 让历史会话可深链/刷新保留。
