import React, { useEffect, useState, useMemo } from 'react'
import { AppIcons } from '@/lib/icons'

export interface ConversationLoadingStateProps {
  className?: string
  /** Subtítulo ou dica opcional (ex: nome do perfil se filtrado) */
  accountName?: string
  /** Mensagem customizada inicial ou sobrescrita */
  customMessage?: string
}

const DEFAULT_NARRATIVE_STEPS = [
  {
    title: 'Conectando ao WhatsApp...',
    hint: 'Sincronizando fila de conversas em tempo real',
    icon: 'whatsapp',
  },
  {
    title: 'Buscando suas conversas...',
    hint: 'Carregando mensagens recentes e contatos',
    icon: 'chat',
  },
  {
    title: 'Lendo o histórico e prioridades...',
    hint: 'Organizando por tempo sem resposta e temperatura',
    icon: 'filter',
  },
  {
    title: 'Organizando a sua fila...',
    hint: 'Mapeando leads quentes e lembretes de follow-up',
    icon: 'sparkle',
  },
  {
    title: 'Quase lá...',
    hint: 'Finalizando carregamento das conversas',
    icon: 'check',
  },
] as const

type MorphStage = 'typing' | 'wave' | 'pulse' | 'orbit' | 'ready'

/**
 * Loader animado premium para o carregamento inicial da Inbox.
 *
 * Características:
 * - 3 a 5 pontinhos com formato estilo "digitando..." do WhatsApp que evoluem através de 4-5 fases morfológicas:
 *   1. typing: saltos suaves clássicos de digitação do WhatsApp
 *   2. wave: ondas senoidais fluidas
 *   3. pulse: expansão e brilho radial em halo tipo radar
 *   4. orbit: rotação circular dos pontinhos em órbita suave
 *   5. ready: agrupamento suave em check pulsante
 * - Cores e gradientes fiéis à paleta do app: azul-gelo (#E6F3F5), verde-menta (#4EBE73), cinza ardósia (#464B5F).
 * - Ciclo de mensagens narradas em português do Brasil a cada ~2.2s com barra de progresso suave.
 * - Respeita rigorosamente prefers-reduced-motion (sem movimento brusco, apenas transição de opacidade/pulsar suave).
 */
export const ConversationLoadingState: React.FC<ConversationLoadingStateProps> = ({
  className = '',
  accountName,
  customMessage,
}) => {
  const [stepIndex, setStepIndex] = useState(0)
  const [stage, setStage] = useState<MorphStage>('typing')
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  // Detecta prefers-reduced-motion
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mediaQuery.matches)

    const handler = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches)
    }
    mediaQuery.addEventListener?.('change', handler)
    return () => mediaQuery.removeEventListener?.('change', handler)
  }, [])

  // Ciclo das mensagens narradas a cada ~2.3s
  useEffect(() => {
    const timer = setInterval(() => {
      setStepIndex((prev) => (prev + 1) % DEFAULT_NARRATIVE_STEPS.length)
    }, 2300)
    return () => clearInterval(timer)
  }, [])

  // Evolução morfológica da animação ao longo do tempo (typing -> wave -> pulse -> orbit -> ready)
  useEffect(() => {
    const stages: MorphStage[] = ['typing', 'wave', 'pulse', 'orbit', 'ready']
    let currentIndex = 0

    const morphTimer = setInterval(() => {
      currentIndex = (currentIndex + 1) % stages.length
      setStage(stages[currentIndex])
    }, 2800)

    return () => clearInterval(morphTimer)
  }, [])

  const currentStep = DEFAULT_NARRATIVE_STEPS[stepIndex]

  // Renderiza ícone auxiliar da etapa narrativa
  const renderStepIcon = useMemo(() => {
    const iconClass = 'h-3.5 w-3.5 text-[#3D745B]'
    switch (currentStep.icon) {
      case 'whatsapp':
        return <AppIcons.phoneDevice className={iconClass} />
      case 'chat':
        return <AppIcons.queueAll className={iconClass} />
      case 'filter':
        return <AppIcons.filterQueue className={iconClass} />
      case 'sparkle':
        return <AppIcons.aiSparkle className={iconClass} />
      case 'check':
      default:
        return <AppIcons.checkCircle className={iconClass} />
    }
  }, [currentStep.icon])

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Carregando conversas do WhatsApp"
      className={`relative flex flex-col items-center justify-center p-6 text-center select-none overflow-hidden ${className}`}
    >
      {/* Background sutil com halo de luz e degradê azul-gelo suave */}
      <div
        className="pointer-events-none absolute -inset-10 opacity-60 blur-2xl"
        style={{
          background:
            'radial-gradient(circle at 50% 40%, rgba(203, 235, 230, 0.45) 0%, rgba(230, 243, 245, 0.25) 45%, transparent 75%)',
        }}
      />

      {/* Cartão container que evoca uma bolha de conversa elegante */}
      <div className="relative z-10 flex w-full max-w-[320px] flex-col items-center rounded-2xl border border-[#D5E3E2]/80 bg-white/85 p-6 shadow-sm backdrop-blur-md transition-all">
        {/* Cabeçalho da bolha com badge de status do WhatsApp */}
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-[#D0E5DA] bg-[#F2FAF6] px-3 py-1 text-[11px] font-medium text-[#2F6B4F]">
          <span className="relative flex h-2 w-2">
            <span
              className={`absolute inline-flex h-full w-full rounded-full bg-[#3FB980] opacity-75 ${
                prefersReducedMotion ? '' : 'animate-ping'
              }`}
            />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#2FA968]" />
          </span>
          <span className="tracking-tight">
            {accountName ? `WhatsApp · ${accountName}` : 'Sincronização WhatsApp'}
          </span>
        </div>

        {/* ========================================================================= */}
        {/* 1 e 2. ANIMAÇÃO CENTRAL DE PONTINHOS QUE EVOLUEM (MORPHING DOTS)           */}
        {/* ========================================================================= */}
        <div
          className="relative my-2 flex h-20 w-36 items-center justify-center"
          aria-hidden="true"
        >
          {/* Halo de fundo pulsante sutil */}
          <div
            className={`absolute h-14 w-14 rounded-full bg-[#57D067]/15 blur-md transition-transform duration-700 ${
              prefersReducedMotion ? '' : 'animate-pulse'
            }`}
          />

          {/* Bolha visual dos pontinhos estilo WhatsApp */}
          <div className="relative flex items-center justify-center rounded-full border border-[#CCE2DC] bg-[#F6FCFA] px-5 py-3 shadow-[0_2px_8px_rgba(78,190,115,0.08)]">
            {stage === 'orbit' && !prefersReducedMotion ? (
              /* FASE ORBIT: 4 pontinhos em anel giratório */
              <div className="relative h-7 w-7 animate-spin [animation-duration:1.6s]">
                <span className="absolute top-0 left-1/2 -translate-x-1/2 h-2 w-2 rounded-full bg-[#2FA968]" />
                <span className="absolute right-0 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-[#464B5F]" />
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-2 w-2 rounded-full bg-[#64C99D]" />
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-[#82D9B3]" />
              </div>
            ) : stage === 'pulse' && !prefersReducedMotion ? (
              /* FASE PULSE: 3 pontinhos que expandem e brilham em uníssono */
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full bg-[#2FA968] shadow-sm transition-transform duration-500"
                  style={{
                    animation: 'chat-dot-pulse 0.9s ease-in-out infinite alternate',
                  }}
                />
                <span
                  className="h-3 w-3 rounded-full bg-[#464B5F] shadow-sm transition-transform duration-500"
                  style={{
                    animation: 'chat-dot-pulse 0.9s ease-in-out infinite 0.2s alternate',
                  }}
                />
                <span
                  className="h-2.5 w-2.5 rounded-full bg-[#2FA968] shadow-sm transition-transform duration-500"
                  style={{
                    animation: 'chat-dot-pulse 0.9s ease-in-out infinite 0.4s alternate',
                  }}
                />
              </div>
            ) : stage === 'ready' && !prefersReducedMotion ? (
              /* FASE READY: Pontinhos que se alinham com um check central suave */
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#68A087] transition-all" />
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#2FA968] text-white shadow-xs">
                  <AppIcons.check className="h-3 w-3 stroke-[2.5]" />
                </span>
                <span className="h-2 w-2 rounded-full bg-[#68A087] transition-all" />
              </div>
            ) : stage === 'wave' && !prefersReducedMotion ? (
              /* FASE WAVE: Onda senoidal mais ampla com 4 pontinhos */
              <div className="flex items-center gap-1.5">
                {[0, 1, 2, 3].map((idx) => (
                  <span
                    key={idx}
                    className="h-2 w-2 rounded-full"
                    style={{
                      backgroundColor:
                        idx === 0
                          ? '#2FA968'
                          : idx === 1
                            ? '#4EBE73'
                            : idx === 2
                              ? '#464B5F'
                              : '#64C99D',
                      animation: `chat-dot-wave 1.1s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite ${idx * 0.14}s`,
                    }}
                  />
                ))}
              </div>
            ) : (
              /* FASE TYPING (padrão): 3 pontinhos clássicos estilo digitando do WhatsApp */
              <div className="flex items-center gap-1.5">
                {[0, 1, 2].map((idx) => (
                  <span
                    key={idx}
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                      backgroundColor: idx === 0 ? '#2FA968' : idx === 1 ? '#464B5F' : '#4EBE73',
                      animation: prefersReducedMotion
                        ? 'none'
                        : `chat-dot-bounce 1.2s cubic-bezier(0.4, 0, 0.2, 1) infinite ${idx * 0.18}s`,
                      opacity: prefersReducedMotion ? 0.75 + idx * 0.1 : undefined,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Indicador de estágio da metamorfose dos pontinhos */}
        <div className="mb-2 flex items-center justify-center gap-1">
          {(['typing', 'wave', 'pulse', 'orbit', 'ready'] as const).map((s) => (
            <span
              key={s}
              className={`h-1 rounded-full transition-all duration-500 ${
                stage === s ? 'w-4 bg-[#2FA968]' : 'w-1 bg-[#D3DFDE]'
              }`}
            />
          ))}
        </div>

        {/* ========================================================================= */}
        {/* 3. CICLO DE MENSAGENS NARRADAS                                            */}
        {/* ========================================================================= */}
        <div className="min-h-[52px] w-full px-1">
          <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-[#353B47] transition-all">
            <span className="shrink-0">{renderStepIcon}</span>
            <span className="truncate">{customMessage || currentStep.title}</span>
          </div>
          <p className="mt-1 text-[11px] leading-tight text-[#818995]">{currentStep.hint}</p>
        </div>

        {/* Barra de progresso contínua e suave para dar sensação de avanço */}
        <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-[#EBF1F0]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#57D067] via-[#4EBE73] to-[#2FA968] transition-all duration-500"
            style={{
              width: `${((stepIndex + 1) / DEFAULT_NARRATIVE_STEPS.length) * 100}%`,
            }}
          />
        </div>

        {/* Rodapé informativo discreto */}
        <div className="mt-3 flex items-center justify-between w-full text-[10px] text-[#9BA3AC]">
          <span>Até centenas de conversas</span>
          <span className="font-medium text-[#464B5F]">
            {stepIndex + 1} de {DEFAULT_NARRATIVE_STEPS.length}
          </span>
        </div>
      </div>

      {/* Skeletons fantasmas semi-transparentes atrás para antecipar o layout da lista */}
      <div
        className="pointer-events-none mt-4 w-full max-w-[320px] space-y-2 opacity-35"
        aria-hidden="true"
      >
        <div className="h-14 rounded-xl border border-dashed border-[#D2DDDC] bg-white/40" />
        <div className="h-14 rounded-xl border border-dashed border-[#D2DDDC] bg-white/20" />
      </div>

      {/* Keyframe styles inline com fallback seguro e suporte reduced-motion */}
      <style>{`
        @keyframes chat-dot-bounce {
          0%, 60%, 100% {
            transform: translateY(0);
            opacity: 0.45;
          }
          30% {
            transform: translateY(-7px) scale(1.15);
            opacity: 1;
          }
        }
        @keyframes chat-dot-wave {
          0%, 100% {
            transform: translateY(0) scale(0.9);
            opacity: 0.5;
          }
          50% {
            transform: translateY(-8px) scale(1.2);
            opacity: 1;
          }
        }
        @keyframes chat-dot-pulse {
          0% {
            transform: scale(0.85);
            opacity: 0.5;
          }
          100% {
            transform: scale(1.3);
            opacity: 1;
            filter: drop-shadow(0 0 4px rgba(47, 169, 104, 0.4));
          }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes chat-dot-bounce {
            0%, 100% { opacity: 0.6; }
            50% { opacity: 1; }
          }
          @keyframes chat-dot-wave {
            0%, 100% { opacity: 0.6; }
            50% { opacity: 1; }
          }
          @keyframes chat-dot-pulse {
            0%, 100% { opacity: 0.6; }
            50% { opacity: 1; }
          }
        }
      `}</style>
    </div>
  )
}

export default ConversationLoadingState
