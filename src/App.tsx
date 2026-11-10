import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import AppShell from '@/components/AppShell'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { ForgotPassword, ResetPassword } from '@/pages/AuthPages'
import Agent from '@/pages/Agent'
import FollowUps from '@/pages/FollowUps'
import Inbox from '@/pages/Inbox'
import Landing from '@/pages/Landing'
import NotFound from '@/pages/NotFound'
import Settings from '@/pages/Settings'

function ProtectedShell() {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading)
    return (
      <div className="grid min-h-screen place-items-center bg-[#F4F7F7] text-sm text-[#68717D]">
        Abrindo o assistente...
      </div>
    )
  if (!user) return <Navigate to="/" replace state={{ from: location }} />
  return <AppShell />
}

export default function App() {
  return (
    <BrowserRouter>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Sonner position="bottom-right" />
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="/registro" element={<Navigate to="/" replace />} />
            <Route path="/esqueci-senha" element={<ForgotPassword />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route element={<ProtectedShell />}>
              <Route path="/inbox" element={<Inbox />} />
              <Route path="/conversas" element={<Navigate to="/inbox" replace />} />
              <Route path="/follow-ups" element={<FollowUps />} />
              <Route path="/followups" element={<Navigate to="/follow-ups" replace />} />
              <Route path="/agente" element={<Agent />} />
              <Route path="/agent" element={<Navigate to="/agente" replace />} />
              <Route path="/configuracoes" element={<Settings />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </TooltipProvider>
    </BrowserRouter>
  )
}
