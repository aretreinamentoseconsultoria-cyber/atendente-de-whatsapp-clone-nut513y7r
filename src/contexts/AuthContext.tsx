import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { RecordModel } from 'pocketbase'
import pb from '@/lib/pocketbase/client'

type AuthContextValue = {
  user: RecordModel | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => void
  acknowledgeRisk: () => Promise<void>
  completeOnboarding: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<RecordModel | null>(pb.authStore.record)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = pb.authStore.onChange((_token, record) => setUser(record), true)
    if (pb.authStore.isValid) {
      pb.collection('users')
        .authRefresh()
        .catch(() => pb.authStore.clear())
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
    return unsubscribe
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login: async (email, password) => {
        await pb.collection('users').authWithPassword(email, password)
      },
      register: async (name, email, password) => {
        await pb.collection('users').create({ name, email, password, passwordConfirm: password })
        await pb.collection('users').authWithPassword(email, password)
      },
      logout: () => {
        try {
          const currentUserId = user?.id || (pb.authStore.record ? pb.authStore.record.id : '')
          if (currentUserId) {
            localStorage.removeItem(`fernand_selected_profile_id_${currentUserId}`)
            localStorage.removeItem(`fernand_inbox_column_layout_${currentUserId}`)
            localStorage.removeItem(`fernand_onboarding_completed_${currentUserId}`)
          }
          localStorage.removeItem('fernand_selected_profile_id_v1')
          localStorage.removeItem('fernand_inbox_column_layout_v2')
          localStorage.removeItem('fernand_onboarding_completed_v1')

          sessionStorage.removeItem('zernio_initial_avatar_sync_done')
          sessionStorage.removeItem('fernand_onboarding_skipped_session_v1')
        } catch {
          /* intentionally ignored */
        }
        pb.authStore.clear()
        setUser(null)
      },
      acknowledgeRisk: async () => {
        if (!pb.authStore.record) return
        const updated = await pb
          .collection('users')
          .update(pb.authStore.record.id, { risk_acknowledged: true })
        pb.authStore.save(pb.authStore.token, updated)
      },
      completeOnboarding: async () => {
        if (!pb.authStore.record) return
        const updated = await pb
          .collection('users')
          .update(pb.authStore.record.id, { onboarding_completed: true })
        pb.authStore.save(pb.authStore.token, updated)
      },
    }),
    [loading, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return context
}
