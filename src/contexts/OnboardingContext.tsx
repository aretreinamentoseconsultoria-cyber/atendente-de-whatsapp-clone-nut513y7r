import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useCrm } from '@/contexts/CrmContext'

interface OnboardingContextType {
  isOpen: boolean
  currentStep: number // 1, 2, 3, 4
  openWizard: (step?: number) => void
  closeWizard: () => void
  goToStep: (step: number) => void
  skipOnboarding: () => void
  completeOnboarding: () => Promise<void>
  needsOnboarding: boolean
  isSkipped: boolean
}

const OnboardingContext = createContext<OnboardingContextType | null>(null)

const ONBOARDING_SKIPPED_KEY = 'fernand_onboarding_skipped_session_v1'

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { user, completeOnboarding: markUserOnboardingCompleted } = useAuth()
  const { zernioSettings, conversations } = useCrm()

  const [isOpen, setIsOpen] = useState(false)
  const [currentStep, setCurrentStep] = useState(1)
  const [isSkipped, setIsSkipped] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(ONBOARDING_SKIPPED_KEY) === 'true'
    } catch {
      return false
    }
  })

  // Flag local em memória/storage de conclusão recente do onboarding (período de graça)
  // para evitar que o banner "configuração pendente" apareça na transição antes do backend refletir
  const [justCompletedOnboarding, setJustCompletedOnboarding] = useState<boolean>(() => {
    try {
      const uid = user?.id || ''
      return uid
        ? sessionStorage.getItem(`fernand_onboarding_just_completed_${uid}`) === 'true'
        : false
    } catch {
      return false
    }
  })

  // Checagem de onboarding concluído no banco ou marcado recentemente
  const isCompletedOnUser = Boolean(user?.onboarding_completed || justCompletedOnboarding)

  // Detecção automática inteligente:
  // Se o usuário tem conexão Zernio ativa ou conversas sincronizadas já salvas,
  // considera onboarding como já feito e atualiza o usuário no banco se ainda não estiver marcado
  const isAutoQualified = Boolean(
    justCompletedOnboarding ||
    zernioSettings?.is_connected ||
    zernioSettings?.last_synced_at ||
    (conversations && conversations.length > 0),
  )

  useEffect(() => {
    if (user && !user?.onboarding_completed && (isAutoQualified || justCompletedOnboarding)) {
      // Auto-marca como concluído no banco
      void markUserOnboardingCompleted().catch(() => {})
    }
  }, [user, isAutoQualified, justCompletedOnboarding, markUserOnboardingCompleted])

  // Se o usuário ainda não completou nem é auto qualificado
  const needsOnboarding = Boolean(
    user && !isCompletedOnUser && !isAutoQualified && !justCompletedOnboarding,
  )

  // Abre automaticamente apenas na 1ª vez do usuário se ele precisa de onboarding e não pulou na sessão
  useEffect(() => {
    if (needsOnboarding && !isSkipped) {
      setIsOpen(true)
    }
  }, [needsOnboarding, isSkipped])

  const openWizard = (step?: number) => {
    if (step) {
      setCurrentStep(step)
    } else {
      // Inicia do primeiro passo pendente
      if (zernioSettings?.is_connected) {
        setCurrentStep(3)
      } else {
        setCurrentStep(1)
      }
    }
    setIsOpen(true)
  }

  const closeWizard = () => {
    setIsOpen(false)
  }

  const goToStep = (step: number) => {
    if (step >= 1 && step <= 4) {
      setCurrentStep(step)
    }
  }

  const skipOnboarding = () => {
    setIsOpen(false)
    setIsSkipped(true)
    try {
      sessionStorage.setItem(ONBOARDING_SKIPPED_KEY, 'true')
    } catch {
      // ignore
    }
  }

  const completeOnboarding = async () => {
    setJustCompletedOnboarding(true)
    if (user?.id) {
      try {
        sessionStorage.setItem(`fernand_onboarding_just_completed_${user.id}`, 'true')
      } catch {
        // ignore
      }
    }
    setIsOpen(false)
    setIsSkipped(false)
    try {
      sessionStorage.removeItem(ONBOARDING_SKIPPED_KEY)
    } catch {
      // ignore
    }
    try {
      await markUserOnboardingCompleted()
    } catch (err) {
      console.warn('Erro ao marcar onboarding_completed no usuário:', err)
    }
  }

  const value = useMemo(
    () => ({
      isOpen,
      currentStep,
      openWizard,
      closeWizard,
      goToStep,
      skipOnboarding,
      completeOnboarding,
      needsOnboarding,
      isSkipped,
    }),
    [isOpen, currentStep, needsOnboarding, isSkipped],
  )

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>
}

export function useOnboarding() {
  const context = useContext(OnboardingContext)
  if (!context) throw new Error('useOnboarding deve ser usado dentro de OnboardingProvider')
  return context
}
