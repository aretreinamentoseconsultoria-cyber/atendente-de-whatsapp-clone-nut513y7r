import { Navigate, useLocation } from 'react-router-dom'

import { useAuth } from '@/contexts/AuthContext'

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="login-screen">
        <span className="spinner" />
        <span>Carregando o assistente…</span>
      </div>
    )
  }

  if (!user) return <Navigate to="/" replace state={{ from: location.pathname }} />
  return children
}
