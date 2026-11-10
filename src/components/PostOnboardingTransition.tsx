import { useEffect, useState, useMemo, useRef } from 'react'
import { AloLogo } from '@/components/AloLogo'
import { ZernioBadge } from '@/components/ZernioLogo'
import { AppIcons } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import { ShinyText } from '@/components/reactbits/ShinyText'
import { useCrm } from '@/contexts/CrmContext'
import { ZERNIO_REFERRAL_URL } from '@/components/ZernioLogo'
import { testZernioConnection, syncZernioConversations, type SyncResponse } from '@/services/zernio'

export interface PostOnboardingTransitionProps {
  onComplete: () => void
  /** Se veio de um resultado de sincronização já rodado no passo 4 */
  initialSyncResult?: {
    success: boolean
    conversationsSynced: number
    messagesSynced: number
  } | null
  /** Se deve disparar a sincronização se ainda não tiver resultado */
  autoStartSync?: boolean
}

type StageKey = 'connect' | 'conversations' | 'messages' | 'classifying' | 'ready'
type StageState = 'pending' | 'active' | 'done'

const THINKING_PHRASES = [
  'entendendo o que precisa de resposta imediata...',
  'separando leads quentes e clientes com alto interesse...',
  'identificando mensagens recebidas na madrugada...',
  'organizando a fila de acompanhamento e follow-ups...',
  'preparando as melhores sugestões de resposta...',
]

export function PostOnboardingTransition({
  onComplete,
  initialSyncResult = null,
  autoStartSync = true,
}: PostOnboardingTransitionProps) {
  const { conversations, messages, refresh, refreshZernioSettings } = useCrm()

  // Estados dos passos
  const [connectState, setConnectState] = useState<StageState>('active')
  const [conversationsState, setConversationsState] = useState<StageState>('pending')
  const [messagesState, setMessagesState] = useState<StageState>('pending')
  const [classifyingState, setClassifyingState] = useState<StageState>('pending')
  const [readyState, setReadyState] = useState<StageState>('pending')

  // Contadores reais
  const [conversationsTarget, setConversationsTarget] = useState<number>(() => {
    if (initialSyncResult?.conversationsSynced) return initialSyncResult.conversationsSynced
    return conversations?.length || 0
  })
  const [displayedConversationsCount, setDisplayedConversationsCount] = useState<number>(0)

  const [messagesTarget, setMessagesTarget] = useState<number>(() => {
    if (initialSyncResult?.messagesSynced) return initialSyncResult.messagesSynced
    return messages?.length || 0
  })
  const [displayedMessagesCount, setDisplayedMessagesCount] = useState<number>(0)

  // Status de detalhe
  const [detectedNumbersCount, setDetectedNumbersCount] = useState<number>(0)
  const [thinkingIndex, setThinkingIndex] = useState(0)
  const [isRetryingSync, setIsRetryingSync] = useState(false)
  const [statusNote, setStatusNote] = useState<string>('')
  const [isSlowOrBackground, setIsSlowOrBackground] = useState(false)
  const [autoRedirectCountdown, setAutoRedirectCountdown] = useState<number | null>(null)

  // Referência para evitar múltiplas execuções simultâneas
  const syncExecutedRef = useRef(false)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Frases de "pensando" alternando suavemente a cada 2.4s
  useEffect(() => {
    if (classifyingState !== 'active') return
    const interval = setInterval(() => {
      setThinkingIndex((prev) => (prev + 1) % THINKING_PHRASES.length)
    }, 2400)
    return () => clearInterval(interval)
  }, [classifyingState])

  // Timer de segurança: após 18s se ainda não terminou tudo, libera botão e avisa conclusão em segundo plano
  useEffect(() => {
    const fallbackTimer = setTimeout(() => {
      if (isMountedRef.current && readyState !== 'done') {
        setIsSlowOrBackground(true)
        setStatusNote('Concluindo sincronização pesada em segundo plano para não tomar seu tempo.')
        // Avança para ready para não bloquear
        setConnectState('done')
        setConversationsState('done')
        setMessagesState('done')
        setClassifyingState('done')
        setReadyState('done')
        setAutoRedirectCountdown(3)
      }
    }, 18000)
    return () => clearTimeout(fallbackTimer)
  }, [readyState])

  // Função para re-sincronizar quando o usuário conecta o WhatsApp depois
  const handleRetrySync = async () => {
    setIsRetryingSync(true)
    setAutoRedirectCountdown(null)
    try {
      // Re-testa conexão para ver se detectou novos números
      try {
        const testRes = await testZernioConnection()
        if (testRes?.accounts && testRes.accounts.length > 0) {
          setDetectedNumbersCount(testRes.accounts.length)
        }
      } catch {
        // ignore
      }

      const syncRes = await syncZernioConversations()
      await refresh().catch(() => {})
      await refreshZernioSettings().catch(() => {})

      const finalConvs = syncRes?.conversationsSynced ?? (conversations?.length || 0)
      const finalMsgs = syncRes?.messagesSynced ?? (messages?.length || 0)

      setConversationsTarget(finalConvs)
      setMessagesTarget(finalMsgs)

      if (finalConvs > 0) {
        // Se agora puxou conversas, inicia o auto-redirect
        setAutoRedirectCountdown(3)
      }
    } catch (err) {
      console.warn('Erro ao retentar sincronização:', err)
    } finally {
      if (isMountedRef.current) {
        setIsRetryingSync(false)
      }
    }
  }

  // Contadores animados com incremento suave
  useEffect(() => {
    if (conversationsTarget <= 0) return
    const step = Math.max(1, Math.floor(conversationsTarget / 20))
    const timer = setInterval(() => {
      setDisplayedConversationsCount((prev) => {
        if (prev >= conversationsTarget) {
          clearInterval(timer)
          return conversationsTarget
        }
        return Math.min(prev + step, conversationsTarget)
      })
    }, 40)
    return () => clearInterval(timer)
  }, [conversationsTarget])

  useEffect(() => {
    if (messagesTarget <= 0) return
    const step = Math.max(1, Math.floor(messagesTarget / 25))
    const timer = setInterval(() => {
      setDisplayedMessagesCount((prev) => {
        if (prev >= messagesTarget) {
          clearInterval(timer)
          return messagesTarget
        }
        return Math.min(prev + step, messagesTarget)
      })
    }, 35)
    return () => clearInterval(timer)
  }, [messagesTarget])

  // Fluxo principal orquestrado da transição
  useEffect(() => {
    if (syncExecutedRef.current) return
    syncExecutedRef.current = true

    let isCancelled = false

    const runFlow = async () => {
      // -----------------------------------------------------------
      // ETAPA 1: Conectando à Zernio
      // -----------------------------------------------------------
      setConnectState('active')
      try {
        const testRes = await testZernioConnection()
        if (isCancelled) return
        if (testRes?.accounts && testRes.accounts.length > 0) {
          setDetectedNumbersCount(testRes.accounts.length)
        }
      } catch (err) {
        console.warn('Verificação de conexão durante transição:', err)
      }

      await new Promise((r) => setTimeout(r, 900))
      if (isCancelled) return
      setConnectState('done')

      // -----------------------------------------------------------
      // ETAPA 2: Puxando suas conversas
      // -----------------------------------------------------------
      setConversationsState('active')

      let syncRes: SyncResponse | null = null
      if (initialSyncResult) {
        syncRes = {
          success: initialSyncResult.success,
          conversationsSynced: initialSyncResult.conversationsSynced,
          messagesSynced: initialSyncResult.messagesSynced,
          message: 'Conversas prontas',
        }
      } else if (autoStartSync) {
        try {
          syncRes = await syncZernioConversations()
        } catch (err) {
          console.warn('Erro durante syncZernioConversations na transição:', err)
        }
      }

      if (isCancelled) return

      // Atualiza banco e contexts em paralelo
      await refresh().catch(() => {})
      await refreshZernioSettings().catch(() => {})

      if (isCancelled) return

      const finalConvs = syncRes?.conversationsSynced ?? (conversations?.length || 0)
      const finalMsgs = syncRes?.messagesSynced ?? (messages?.length || 0)

      setConversationsTarget(finalConvs)
      setMessagesTarget(finalMsgs)

      // Aguarda leitura das conversas
      await new Promise((r) => setTimeout(r, 1200))
      if (isCancelled) return
      setConversationsState('done')

      // -----------------------------------------------------------
      // ETAPA 3: Lendo as mensagens
      // -----------------------------------------------------------
      setMessagesState('active')
      await new Promise((r) => setTimeout(r, 1100))
      if (isCancelled) return
      setMessagesState('done')

      // -----------------------------------------------------------
      // ETAPA 4: Classificando prioridades (IA pensando)
      // -----------------------------------------------------------
      setClassifyingState('active')
      await new Promise((r) => setTimeout(r, 2200))
      if (isCancelled) return
      setClassifyingState('done')

      // -----------------------------------------------------------
      // ETAPA 5: Sua inbox está pronta!
      // -----------------------------------------------------------
      setReadyState('done')

      // Auto-inicia contagem regressiva suave (3, 2, 1) APENAS se houver conversas sincronizadas
      // Se finalConvs for 0, não redireciona automaticamente para que o usuário veja com calma o aviso de conectar o WhatsApp
      if (finalConvs > 0) {
        setAutoRedirectCountdown(3)
      } else {
        setAutoRedirectCountdown(null)
      }
    }

    void runFlow()

    return () => {
      isCancelled = true
    }
  }, [autoStartSync, initialSyncResult, refresh, refreshZernioSettings])

  // Contagem regressiva de auto-avanço na inbox pronta
  const onCompleteRef = useRef(onComplete)
  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
    if (autoRedirectCountdown === null) return
    if (autoRedirectCountdown <= 0) {
      onCompleteRef.current()
      return
    }
    const timer = setInterval(() => {
      setAutoRedirectCountdown((prev) => {
        if (prev === null) return null
        if (prev <= 1) {
          clearInterval(timer)
          onCompleteRef.current()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [autoRedirectCountdown !== null])

  // Resumo de classificação a partir das conversas reais carregadas
  const queueStats = useMemo(() => {
    const list = conversations || []
    const responder = list.filter(
      (c) =>
        (c.status === 'sem_resposta' && c.last_direction === 'in') || c.temperature === 'quente',
    ).length
    const followups = list.filter((c) => c.status === 'acompanhamento').length
    const madrugada = list.filter((c) => c.status === 'madrugada').length
    return { responder, followups, madrugada, total: list.length }
  }, [conversations])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto overscroll-contain bg-slate-950/90 text-[#353B47]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="transition-title"
    >
      {/* Imagem de fundo azul-gelo (mesma textura Cloudinary da landing/inbox) */}
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center bg-no-repeat opacity-85"
        style={{
          backgroundImage:
            "url('https://res.cloudinary.com/dfrzlhyvi/image/upload/v1789769629/bg-exemplo-2-azul-gelo_bfo81i.png')",
        }}
        aria-hidden="true"
      />

      {/* Gradiente radial sutil para foco central cinematográfico, sem overlay branco */}
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-radial from-slate-900/10 via-slate-900/50 to-slate-950/80"
        aria-hidden="true"
      />

      {/* Card central translúcido com backdrop blur profissional e altura limitada à viewport */}
      <div className="relative z-10 w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden rounded-3xl border border-[#CBD6D7]/70 bg-white/92 backdrop-blur-xl shadow-2xl transition-all duration-300">
        {/* Barra superior de brilho suave (fixa) */}
        <div className="shrink-0 h-1.5 w-full bg-linear-to-r from-[#3B82F6] via-[#10B981] to-[#8B5CF6]" />

        {/* Header do Card com Marca Alô e Zernio (fixo, shrink-0) */}
        <div className="shrink-0 px-5 pt-4 pb-3 sm:px-7 sm:pt-5 sm:pb-3.5 border-b border-[#CBD6D7]/60">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2.5">
              <AloLogo height={26} />
            </div>
            <div className="flex items-center gap-2">
              <ZernioBadge />
              <span className="rounded-full bg-[#EBF7F2] border border-[#BDE3D5] px-2 py-0.5 text-[10px] font-bold text-[#2C8A55] uppercase tracking-wider">
                Setup em tempo real
              </span>
            </div>
          </div>

          <h1
            id="transition-title"
            className="text-lg sm:text-xl font-bold tracking-tight text-[#2B303B]"
          >
            {readyState === 'done'
              ? '🎉 Tudo pronto! Sua inbox foi montada'
              : 'Preparando sua experiência no Alô'}
          </h1>
          <p className="mt-0.5 text-xs sm:text-[13px] text-[#667080] leading-relaxed">
            {readyState === 'done'
              ? 'Suas conversas do WhatsApp estão sincronizadas, ordenadas e com prioridades calculadas.'
              : 'Estamos organizando seu WhatsApp oficial via Zernio para você nunca mais perder um cliente.'}
          </p>
        </div>

        {/* Miolo rolável contendo as 5 etapas e possíveis resumos/alertas */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3 sm:px-7 sm:py-3.5 space-y-2.5">
          {/* ========================================================= */}
          {/* ETAPA 1: Conectando à Zernio */}
          {/* ========================================================= */}
          <StageRow
            title="Conectando à Zernio"
            state={connectState}
            activeText="Validando credenciais da API Meta WhatsApp..."
            doneText={
              detectedNumbersCount > 1
                ? `Conexão estabelecida com sucesso (${detectedNumbersCount} números WhatsApp ativos) ✓`
                : 'Conexão estabelecida e validada com sucesso ✓'
            }
            icon={AppIcons.key}
          />

          {/* ========================================================= */}
          {/* ETAPA 2: Puxando suas conversas */}
          {/* ========================================================= */}
          <StageRow
            title="Puxando suas conversas"
            state={conversationsState}
            activeText={
              conversationsTarget > 0
                ? `Importando conversas recentes... (${displayedConversationsCount} de ${conversationsTarget})`
                : 'Buscando conversas no WhatsApp Business API...'
            }
            doneText={
              conversationsTarget > 0
                ? `${conversationsTarget} conversas encontradas e sincronizadas ✓`
                : 'Busca concluída na Zernio (0 conversas importadas) ✓'
            }
            counter={
              conversationsTarget > 0 ? (
                <span className="font-mono text-xs font-bold text-[#10B981] bg-[#ECFDF5] border border-[#A7F3D0] rounded-md px-2 py-0.5">
                  {displayedConversationsCount} conversas
                </span>
              ) : (
                <span className="font-mono text-xs font-semibold text-[#854D0E] bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5">
                  0 conversas
                </span>
              )
            }
            icon={AppIcons.queueAll}
          />

          {/* ========================================================= */}
          {/* ETAPA 3: Lendo as mensagens */}
          {/* ========================================================= */}
          <StageRow
            title="Lendo as mensagens"
            state={messagesState}
            activeText={
              messagesTarget > 0
                ? `Processando histórico de mensagens... (${displayedMessagesCount} de ${messagesTarget})`
                : 'Lendo o histórico recente das mensagens...'
            }
            doneText={
              messagesTarget > 0
                ? `${messagesTarget} mensagens salvas no histórico local ✓`
                : 'Mensagens recentes importadas e prontas ✓'
            }
            counter={
              messagesTarget > 0 ? (
                <span className="font-mono text-xs font-bold text-[#3B82F6] bg-[#EFF6FF] border border-[#BFDBFE] rounded-md px-2 py-0.5">
                  {displayedMessagesCount} mensagens
                </span>
              ) : null
            }
            icon={AppIcons.moduleInbox}
          />

          {/* ========================================================= */}
          {/* ETAPA 4: Classificando prioridades (IA "pensando") */}
          {/* ========================================================= */}
          <StageRow
            title="Classificando prioridades"
            state={classifyingState}
            customActive={
              <div className="space-y-1.5 pt-0.5">
                <div className="flex items-center gap-2">
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-600" />
                  </span>
                  <ShinyText
                    text={THINKING_PHRASES[thinkingIndex]}
                    color="#6D28D9"
                    shineColor="#A855F7"
                    speed={1.6}
                    className="text-xs font-semibold"
                  />
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-[#7A838D]">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse [animation-delay:200ms]" />
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse [animation-delay:400ms]" />
                  <span className="ml-1 text-[11px] text-[#6B7280]">
                    Calculando fila urgente, madrugada e follow-up
                  </span>
                </div>
              </div>
            }
            doneText={
              queueStats.total > 0
                ? `Prioridades calculadas: ${queueStats.responder} na fila urgente · ${queueStats.madrugada} da madrugada ✓`
                : 'Prioridades e filas inteligentes organizadas ✓'
            }
            icon={AppIcons.aiSparkle}
          />

          {/* ========================================================= */}
          {/* ETAPA 5: Sua inbox está pronta! */}
          {/* ========================================================= */}
          <StageRow
            title="Sua inbox está pronta!"
            state={readyState}
            activeText="Finalizando últimos ajustes na interface..."
            doneText="Todas as filas montadas. Você já pode atender e responder com sugestões."
            icon={AppIcons.checkCircle}
            isFinal
          />

          {/* Resumo visual rápido das filas criadas quando pronto */}
          {readyState === 'done' && conversationsTarget > 0 && (
            <div className="p-3 rounded-2xl border border-[#CBD6D7] bg-[#F8FAFA] space-y-2 animate-grow-up">
              <span className="text-[10.5px] font-bold text-[#4B5563] uppercase tracking-wider block">
                Suas filas automáticas:
              </span>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl border border-[#FCA5A5]/60 bg-[#FEF2F2] p-2">
                  <span className="text-sm sm:text-base font-extrabold text-[#DC2626] tabular-nums block">
                    {queueStats.responder}
                  </span>
                  <span className="text-[9.5px] font-semibold text-[#991B1B]">Responder agora</span>
                </div>
                <div className="rounded-xl border border-[#C4B5FD]/60 bg-[#F5F3FF] p-2">
                  <span className="text-sm sm:text-base font-extrabold text-[#7C3AED] tabular-nums block">
                    {queueStats.madrugada}
                  </span>
                  <span className="text-[9.5px] font-semibold text-[#5B21B6]">Madrugada</span>
                </div>
                <div className="rounded-xl border border-[#A7F3D0]/60 bg-[#ECFDF5] p-2">
                  <span className="text-sm sm:text-base font-extrabold text-[#059669] tabular-nums block">
                    {queueStats.followups || queueStats.total}
                  </span>
                  <span className="text-[9.5px] font-semibold text-[#065F46]">Acompanhamento</span>
                </div>
              </div>
            </div>
          )}

          {/* ALERTA AMIGÁVEL E INTELIGENTE: Quando a sincronização puxa 0 conversas ou não detectou número */}
          {readyState === 'done' && conversationsTarget === 0 && (
            <div className="rounded-2xl border border-amber-300/90 bg-[#FEFBF3] p-3.5 space-y-2.5 shadow-xs animate-grow-up">
              <div className="flex items-start gap-2.5">
                <div className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800">
                  <AppIcons.warningCircle className="h-4 w-4 text-amber-800" />
                </div>
                <div className="flex-1 space-y-1">
                  <h4 className="text-xs sm:text-sm font-bold text-[#854D0E]">
                    Nenhuma conversa foi puxada ainda
                  </h4>
                  <p className="text-[11px] sm:text-xs text-[#92400E] leading-relaxed">
                    Seu número de WhatsApp provavelmente ainda não está conectado no painel da
                    Zernio. Para puxar suas conversas, acesse{' '}
                    <strong>Connections → WhatsApp</strong> (modo Coexistência) e sincronize de
                    novo.
                  </p>

                  {/* Ações rápidas dentro do alerta */}
                  <div className="pt-1.5 flex flex-wrap items-center gap-2">
                    <a
                      href={ZERNIO_REFERRAL_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#B45309] bg-white px-2.5 py-1 text-xs font-semibold text-[#92400E] hover:bg-amber-50 hover:text-[#78350F] transition-colors shadow-2xs"
                    >
                      <span>Abrir Zernio</span>
                      <span className="text-[10px]">↗</span>
                    </a>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleRetrySync}
                      disabled={isRetryingSync}
                      className="h-7 text-xs font-semibold border-amber-300 bg-white/90 text-[#854D0E] hover:bg-amber-100/70 px-2.5"
                    >
                      {isRetryingSync ? (
                        <>
                          <AppIcons.spinner className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          Verificando...
                        </>
                      ) : (
                        <>
                          <AppIcons.sync className="mr-1.5 h-3.5 w-3.5" />
                          Sincronizar novamente
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Nota informativa de sincronização em segundo plano, caso ocorra */}
          {statusNote && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900 flex items-start gap-2">
              <AppIcons.info className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" />
              <p className="leading-relaxed">{statusNote}</p>
            </div>
          )}
        </div>

        {/* Rodapé de Ações com Botão de Entrada (shrink-0, SEMPRE visível na base) */}
        <div className="shrink-0 px-5 py-3 sm:px-7 sm:py-3.5 border-t border-[#CBD6D7]/60 bg-[#F8FAFA]/95 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
          <div className="text-xs text-[#7A838D]">
            {readyState === 'done' ? (
              <span className="inline-flex items-center gap-1.5 text-[#059669] font-medium">
                <AppIcons.checkCircle className="h-4 w-4 text-[#10B981]" />
                {autoRedirectCountdown !== null && autoRedirectCountdown > 0
                  ? `Abrindo em ${autoRedirectCountdown}s...`
                  : 'Pronto para começar!'}
              </span>
            ) : isSlowOrBackground ? (
              <span className="text-amber-800">Liberado para entrada imediata</span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[#5F6876]">
                <AppIcons.spinner className="h-3.5 w-3.5 animate-spin text-[#3B82F6]" />
                Sincronizando em tempo real com a Meta WhatsApp API
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {readyState !== 'done' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onComplete}
                className="text-xs text-[#6B7280] hover:text-[#374151]"
              >
                Entrar mesmo assim
              </Button>
            )}

            <Button
              onClick={onComplete}
              disabled={readyState !== 'done' && !isSlowOrBackground}
              className={`text-xs px-6 h-10 font-bold transition-all shadow-md ${
                readyState === 'done'
                  ? 'bg-[#10B981] hover:bg-[#059669] text-white ring-2 ring-[#10B981]/30 hover:scale-[1.02]'
                  : 'bg-[#464B5F] hover:bg-[#383C4C] text-white disabled:opacity-40'
              }`}
            >
              <span>
                {readyState === 'done' &&
                autoRedirectCountdown !== null &&
                autoRedirectCountdown > 0
                  ? `Abrir minha inbox (abrindo em ${autoRedirectCountdown}s)`
                  : 'Abrir minha inbox'}
              </span>
              <AppIcons.arrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

interface StageRowProps {
  title: string
  state: StageState
  activeText?: string
  doneText: string
  counter?: React.ReactNode
  customActive?: React.ReactNode
  icon: React.ComponentType<{ className?: string }>
  isFinal?: boolean
}

function StageRow({
  title,
  state,
  activeText,
  doneText,
  counter,
  customActive,
  icon: Icon,
  isFinal = false,
}: StageRowProps) {
  const isDone = state === 'done'
  const isActive = state === 'active'
  const isPending = state === 'pending'

  return (
    <div
      className={`rounded-2xl border px-3.5 py-2.5 sm:px-4 sm:py-3 transition-all duration-300 ${
        isDone
          ? 'border-[#BDE3D5] bg-[#F2FAF6]/90'
          : isActive
            ? 'border-[#3B82F6]/60 bg-blue-50/70 shadow-xs ring-1 ring-[#3B82F6]/20'
            : 'border-[#CBD6D7]/40 bg-[#F9FAFB]/50 opacity-60'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Indicador / Ícone de estado com suporte a animação e prefers-reduced-motion */}
        <div className="mt-0.5 shrink-0">
          {isDone ? (
            <div className="grid h-6 w-6 sm:h-6.5 sm:w-6.5 place-items-center rounded-full bg-[#10B981] text-white shadow-2xs transition-transform animate-grow-up">
              <AppIcons.check className="h-3.5 w-3.5 stroke-[2.5]" />
            </div>
          ) : isActive ? (
            <div className="relative grid h-6 w-6 sm:h-6.5 sm:w-6.5 place-items-center rounded-full bg-blue-600 text-white shadow-2xs">
              <AppIcons.spinner className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
            </div>
          ) : (
            <div className="grid h-6 w-6 sm:h-6.5 sm:w-6.5 place-items-center rounded-full border border-[#CBD6D7] bg-white text-[#9CA3AF]">
              <Icon className="h-3 w-3" />
            </div>
          )}
        </div>

        {/* Informações da Etapa */}
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center justify-between gap-2">
            <h3
              className={`text-xs sm:text-[13px] font-bold tracking-tight transition-colors leading-snug ${
                isDone ? 'text-[#1E4D3A]' : isActive ? 'text-[#1D4ED8]' : 'text-[#6B7280]'
              }`}
            >
              {title}
            </h3>
            {counter}
          </div>

          {/* Texto explicativo narrado */}
          <div className="text-[11px] sm:text-[11.5px] leading-snug">
            {isDone ? (
              <p className="text-[#2F6B56] font-medium">{doneText}</p>
            ) : isActive ? (
              customActive ? (
                customActive
              ) : (
                <p className="text-[#1E40AF] font-medium flex items-center gap-1.5">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#2563EB] animate-pulse motion-reduce:animate-none" />
                  {activeText}
                </p>
              )
            ) : (
              <p className="text-[#9CA3AF]">Aguardando etapa anterior...</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default PostOnboardingTransition
