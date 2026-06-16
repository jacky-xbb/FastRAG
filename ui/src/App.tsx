// 路由（ADR-0007）：/login 公开；/chat·/chat/:threadId·/upload 受保护（AppLayout 守卫）。
import { Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from './AppLayout'
import { LoginPage } from './pages/LoginPage'
import { ChatPage } from './pages/ChatPage'
import { UploadPage } from './pages/UploadPage'

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AppLayout />}>
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/chat/:threadId" element={<ChatPage />} />
        <Route path="/upload" element={<UploadPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/chat" replace />} />
    </Routes>
  )
}
