import { useState, useEffect, useRef, useCallback } from 'react'
import { AppIcons } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import { ZernioLogo, ZERNIO_REFERRAL_URL } from '@/components/ZernioLogo'

export interface InteractiveDemoMockupProps {
  onOpenAuth?: (mode?: 'login' | 'register') => void
}

type SceneIndex = 0 | 1 | 2

interface SceneConfig {
  id: string
  stepNumber: string
  label: string
  narrative: string
  highlightQueue: 'urgent' | 'followups'
  highlightTag: string
}

const SCENES: SceneConfig[] = [
  {
    id: 'read-prioritize',
    stepNumber: '1',
    label: 'Ler e priorizar',
    narrative: 'Lê passivamente o WhatsApp e prioriza automaticamente na fila "Responder agora".',
    highlightQueue: 'urgent',
    highlightTag: 'Lead Quente',
  },
  {
    id: 'suggest-reply',
    stepNumber: '2',
    label: 'Sugerir e enviar',
    narrative: 'Formula a resposta ideal e envia com 1 clique pela API oficial da Meta.',
    highlightQueue: 'urgent',
    highlightTag: 'Sugestão Pronta',
  },
  {
    id: 'follow-up',
    stepNumber: '3',
    label: 'Follow-up inteligente',
    narrative: 'Transforma a conversa em tarefa com prazo e lembrete para nunca esfriar.',
    highlightQueue: 'followups',
    highlightTag: 'Follow-up amanhã',
  },
]

const SCENE_DURATION_MS = 5500

export function InteractiveDemoMockup({ onOpenAuth }: InteractiveDemoMockupProps) {
  const [currentScene, setCurrentScene] = useState<SceneIndex>(0)
  const [isPlaying, setIsPlaying] = useState(true)
  const [hasCopied, setHasCopied] = useState(false)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  // Digitação do rascunho na Cena 2
  const fullDraftText =
    'Olá, Marina! Atendemos perfeitamente seu time de 5 pessoas. Consigo sim uma condição especial de fechamento para esta semana com setup assistido. Posso te enviar a proposta agora?'
  const [typedChars, setTypedChars] = useState(fullDraftText.length)

  // Detecta prefers-reduced-motion
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mediaQuery.matches)

    const handler = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches)
    }
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  // Loop automático das 3 cenas
  useEffect(() => {
    if (!isPlaying || prefersReducedMotion) return

    const timer = setInterval(() => {
      setCurrentScene((prev) => ((prev + 1) % 3) as SceneIndex)
    }, SCENE_DURATION_MS)

    return () => clearInterval(timer)
  }, [isPlaying, prefersReducedMotion])

  // Efeito de digitação suave ao entrar na Cena 2
  useEffect(() => {
    if (prefersReducedMotion) {
      setTypedChars(fullDraftText.length)
      return
    }

    if (currentScene === 1) {
      setTypedChars(0)
      const startDelay = 220
      let charIdx = 0
      const totalChars = fullDraftText.length
      const stepInterval = 14 // velocidade fluida

      const timeout = setTimeout(() => {
        const interval = setInterval(() => {
          charIdx += 2 // 2 caracteres por tick para manter cadência natural sem travar
          if (charIdx >= totalChars) {
            setTypedChars(totalChars)
            clearInterval(interval)
          } else {
            setTypedChars(charIdx)
          }
        }, stepInterval)
        return () => clearInterval(interval)
      }, startDelay)

      return () => clearTimeout(timeout)
    } else {
      setTypedChars(fullDraftText.length)
    }
  }, [currentScene, prefersReducedMotion, fullDraftText])

  const [hasSent, setHasSent] = useState(false)

  const handleSendClick = useCallback(() => {
    setHasSent(true)
    setTimeout(() => setHasSent(false), 2400)
    if (onOpenAuth) {
      setTimeout(() => onOpenAuth('login'), 350)
    }
  }, [onOpenAuth])

  const handleCopyClick = useCallback(() => {
    setHasCopied(true)
    setTimeout(() => setHasCopied(false), 2400)
    if (onOpenAuth) {
      setTimeout(() => onOpenAuth('login'), 350)
    }
  }, [onOpenAuth])

  const containerRef = useRef<HTMLDivElement>(null)

  return (
    <div
      ref={containerRef}
      className="relative mx-auto w-full overflow-hidden rounded-t-[18px] border-x border-t border-[#CBD6D7] bg-white shadow-[0_-12px_40px_rgba(70,75,95,0.06),0_24px_60px_rgba(70,75,95,0.09)] select-none"
      onMouseEnter={() => setIsPlaying(false)}
      onMouseLeave={() => setIsPlaying(true)}
      role="region"
      aria-label="Demonstração interativa do Atendente de WhatsApp"
    >
      {/* Barra de controle e progresso das 3 cenas (Roteiro Fernand) */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#CBD6D7] bg-[#F7FAFA] px-4 py-2.5 sm:px-6">
        {/* Seletor visual interativo das 3 etapas coreografadas */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className="hidden text-[10px] font-semibold uppercase tracking-wider text-[#A3A5AF] sm:inline-block">
            Demonstração ao vivo:
          </span>
          <div className="flex items-center gap-1 rounded-lg border border-[#CBD6D7] bg-white p-0.5 shadow-sm">
            {SCENES.map((scene, idx) => {
              const active = currentScene === idx
              return (
                <button
                  key={scene.id}
                  type="button"
                  onClick={() => setCurrentScene(idx as SceneIndex)}
                  className={`group relative flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                    active
                      ? 'bg-[#464B5F] text-white shadow-sm'
                      : 'text-[#6C7380] hover:bg-[#F3F6F6] hover:text-[#464B5F]'
                  }`}
                  aria-pressed={active}
                  aria-label={`Ir para a etapa ${scene.stepNumber}: ${scene.label}`}
                >
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold transition-colors ${
                      active ? 'bg-white/20 text-white' : 'bg-[#E5EEF1] text-[#464B5F]'
                    }`}
                  >
                    {scene.stepNumber}
                  </span>
                  <span className="text-[11px] sm:text-xs">{scene.label}</span>

                  {/* Barra de progresso discreta em loop quando a cena está ativa */}
                  {active && isPlaying && !prefersReducedMotion && (
                    <span
                      aria-hidden="true"
                      className="absolute bottom-0 left-1 right-1 h-[2px] rounded-full bg-emerald-400 opacity-90"
                      style={{
                        animation: `progress-fill ${SCENE_DURATION_MS}ms linear forwards`,
                      }}
                    />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Status de auto-play / indicador de API oficial da Meta */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsPlaying((p) => !p)}
            className="inline-flex items-center gap-1 rounded border border-[#CBD6D7] bg-white px-2 py-0.5 text-[10px] font-medium text-[#7A808F] hover:bg-[#F3F6F6] hover:text-[#464B5F]"
            title={isPlaying ? 'Pausar animação em loop' : 'Retomar animação em loop'}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isPlaying ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'
              }`}
            />
            {isPlaying ? 'Loop ativo' : 'Pausado'}
          </button>
          <a
            href={ZERNIO_REFERRAL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-medium text-emerald-800 ring-1 ring-emerald-200/60 hover:bg-emerald-100 transition-colors md:flex"
            title="Conexão oficial Meta via Zernio"
          >
            <AppIcons.shieldSafe className="h-3 w-3 text-emerald-600" />
            <span>API oficial Meta via</span>
            <ZernioLogo height={12} raw className="translate-y-[0.5px]" />
            <span className="text-[9px] text-emerald-700">↗</span>
          </a>
        </div>
      </div>

      {/* Header integrado da demo: narrativa da etapa + barra macOS/status em fluxo contínuo e limpo */}
      <div className="border-b border-[#CBD6D7] bg-white/70 backdrop-blur-md transition-colors duration-300">
        {/* Frase explicativa da cena atual integrada */}
        <div className="flex items-center justify-between px-4 pt-2.5 pb-2 text-xs sm:px-6">
          <div className="flex items-center gap-2 text-[#464B5F]">
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 ring-1 ring-emerald-200/80">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Etapa {SCENES[currentScene].stepNumber}
            </span>
            <span className="text-[#5A6372] transition-opacity duration-300 font-medium">
              {SCENES[currentScene].narrative}
            </span>
          </div>
          <span className="hidden text-[11px] text-[#A3A5AF] sm:inline">
            Passe o mouse para pausar
          </span>
        </div>

        {/* Linha de status do produto (estilo macOS / Fernand) integrada sem divisória cortando o fluxo */}
        <div className="flex h-9 items-center justify-between bg-white/40 px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#CBD6D7]/90" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#CBD6D7]/90" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#CBD6D7]/90" />
            <div className="ml-3 hidden items-center gap-2 border-l border-[#CBD6D7]/70 pl-3 text-[11px] font-medium text-[#7A838E] sm:flex">
              <span className="h-2 w-2 rounded-full bg-[#57D067]" />
              <span>Inbox WhatsApp ·&nbsp;</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-[#7A838E]"></div>
        </div>
      </div>

      {/* LAYOUT INTERNO DA DEMO: 3 Colunas com peças que transacionam e mudam de papel */}
      <div className="grid min-h-[460px] grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)_300px]">
        {/* ========================================================================= */}
        {/* COLUNA 1: Filas Inteligentes (a seleção transita suavemente entre as cenas) */}
        {/* ========================================================================= */}
        <aside className="hidden border-r border-[#CBD6D7]/80 bg-white/65 backdrop-blur-md p-3 md:block transition-colors">
          <div className="mb-2.5 flex items-center justify-between px-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-[#8D95A3]">
            <span>Filas Inteligentes</span>
            {/* Tag sutil de perfil com pin vinho da inbox real */}
          </div>
          <div className="space-y-1">
            {[
              {
                id: 'urgent',
                label: 'Responder agora',
                count: currentScene === 2 ? 2 : 3,
                icon: AppIcons.queueUrgent,
                active: currentScene === 0 || currentScene === 1,
                iconClass: 'text-[#EF4444]',
                tagColor: 'bg-red-50 text-red-600 border border-red-200/50',
              },
              {
                id: 'night',
                label: 'Madrugada',
                count: 1,
                icon: AppIcons.queueNight,
                active: false,
                iconClass: 'text-[#8B5CF6]',
                tagColor: 'bg-[#FFF5E7] text-[#B06D1F] border border-[#F2DEB9]/60',
              },
              {
                id: 'followups',
                label: 'Follow-ups hoje',
                count: currentScene === 2 ? 3 : 2,
                icon: AppIcons.queueFollowUps,
                active: currentScene === 2,
                iconClass: 'text-[#F97316]',
                tagColor: 'bg-amber-50 text-amber-700 border border-amber-200/50',
              },
              {
                id: 'tracking',
                label: 'Em acompanhamento',
                count: 5,
                icon: AppIcons.queueTracking,
                active: false,
                iconClass: 'text-[#10B981]',
                tagColor: 'bg-[#EBF1F2] text-[#7A808F] border border-[#DCE4E4]/50',
              },
            ].map((item) => {
              const Icon = item.icon
              return (
                <div
                  key={item.label}
                  className={`group flex items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium transition-all duration-300 border ${
                    item.active
                      ? 'border-[#CBD6D7] bg-white/95 text-[#464B5F] shadow-xs translate-x-0.5'
                      : 'border-transparent text-[#6D7584] hover:border-[#CBD6D7]/60 hover:bg-white/70 hover:text-[#464B5F]'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Icon
                      className={`h-3.5 w-3.5 shrink-0 transition-transform ${item.iconClass} ${
                        item.active ? 'scale-105' : 'opacity-85 group-hover:opacity-100'
                      }`}
                    />
                    <span className="truncate">{item.label}</span>
                  </div>
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] font-semibold tabular-nums transition-all duration-300 ${
                      item.active ? item.tagColor : 'bg-[#EBF1F2]/80 text-[#7A808F]'
                    }`}
                  >
                    {item.count}
                  </span>
                </div>
              )
            })}
          </div>

          <div className="mt-7 px-2 text-[10px] font-semibold uppercase tracking-wider text-[#8D95A3]">
            Atalhos Rápidos
          </div>
          <div className="mt-2 space-y-1.5 px-2 text-[11px] text-[#6D7584]">
            <div className="flex items-center justify-between">
              <span>Sugerir resposta</span>
              <kbd className="rounded border border-[#CBD6D7] bg-white/90 px-1 py-0.5 text-[9px] font-semibold text-[#464B5F] shadow-2xs">
                R
              </kbd>
            </div>
            <div className="flex items-center justify-between">
              <span>Próxima conversa</span>
              <kbd className="rounded border border-[#CBD6D7] bg-white/90 px-1 py-0.5 text-[9px] font-semibold text-[#464B5F] shadow-2xs">
                J
              </kbd>
            </div>
          </div>

          {/* Destaque contextual da ação atual (glass sutil) */}
          <div className="mt-7 rounded-xl border border-white/80 bg-white/75 p-3 text-[10px] text-[#6D7584] shadow-xs backdrop-blur-sm">
            <div className="flex items-center gap-1.5 font-semibold text-[#464B5F]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span>Modo Operador:</span>
            </div>
            <p className="mt-1 leading-relaxed text-[#6D7584]">
              {currentScene === 0 && 'Leitura em tempo real e priorização na fila.'}
              {currentScene === 1 && 'Sugestão montada pronta para envio assistido.'}
              {currentScene === 2 && 'Follow-up gravado na fila para não perder contato.'}
            </p>
          </div>
        </aside>

        {/* ========================================================================= */}
        {/* COLUNA 2: Conversa central que se desmonta e remonta                       */}
        {/* ========================================================================= */}
        <main className="flex flex-col bg-white/40">
          {/* Header da conversa — visual glass limpo com borda translúcida */}
          <div className="flex items-center justify-between border-b border-[#CBD6D7]/80 bg-white/70 px-4 py-3 backdrop-blur-md sm:px-5 sm:py-3.5 transition-colors">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-base font-semibold text-[#464B5F]">
                  Dúvida sobre o plano para 5 pessoas
                </h2>
                {currentScene === 2 && (
                  <span className="rounded bg-amber-100/90 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 border border-amber-200/60 transition-all duration-300">
                    Follow-up
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[#7A838E]">
                <span className="font-medium text-[#464B5F]">Marina Costa</span>
                <span>·</span>
                <span>+55 11 98842-1002</span>
                <span>·</span>
                <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {currentScene === 2 ? 'Follow-up agendado' : 'Lead Quente'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSendClick}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-all duration-300 shadow-xs ${
                  currentScene === 1
                    ? 'bg-emerald-600 hover:bg-emerald-700 shadow-sm'
                    : 'bg-[#464B5F] hover:bg-[#373C4F]'
                }`}
              >
                {hasSent ? (
                  <>
                    <AppIcons.check className="h-3.5 w-3.5" />
                    <span>Enviado com sucesso!</span>
                  </>
                ) : (
                  <>
                    <AppIcons.send className="h-3.5 w-3.5" />
                    <span>Enviar resposta</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Área do chat com imagem de fundo azul-gelo sem nenhum overlay branco */}
          <div
            className="relative flex-1 bg-cover bg-center bg-no-repeat p-4 sm:p-5"
            style={{
              backgroundImage: `url('https://res.cloudinary.com/dfrzlhyvi/image/upload/v1789769629/bg-exemplo-2-azul-gelo_bfo81i.png')`,
            }}
          >
            {/* Conteúdo dinâmico com caixas em glassmorphism elegante */}
            <div className="relative z-10 space-y-3.5 sm:space-y-4">
              {/* PEÇA 1: Mensagem recebida da Marina com efeito glass sutil */}
              <div
                className={`flex items-start gap-3 transition-all duration-500 ease-out ${
                  currentScene === 0 ? 'scale-[1.01] drop-shadow-xs' : 'scale-100 opacity-95'
                }`}
              >
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/80 border border-white/90 text-xs font-bold text-[#464B5F] shadow-xs backdrop-blur-sm">
                  MC
                </div>
                <div className="max-w-xl rounded-2xl rounded-tl-xs border border-white/80 bg-white/70 p-3.5 text-sm leading-relaxed text-[#464B5F] shadow-xs backdrop-blur-md transition-all duration-300">
                  <p className="font-normal text-[#464B5F]">
                    Oi pessoal! Vi a apresentação do produto. Vocês atendem equipe de 5 atendentes e
                    têm desconto se fecharmos ainda esta semana?
                  </p>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-[#7A838E]">
                    <span>ontem às 16:42 · WhatsApp</span>
                    {currentScene === 0 && (
                      <span className="flex items-center gap-1 font-semibold text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                        Lendo contexto...
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* PEÇA 2: CARD REARRANJÁVEL (Com glassmorphism refinado, bg-white/65-70 + backdrop-blur) */}
              {/* Cena 0: Card de Análise de contexto concluída em Glass */}
              {currentScene === 0 && (
                <div
                  key="scene-0-card"
                  className="ml-11 rounded-2xl border border-white/85 bg-white/65 p-4 shadow-xs backdrop-blur-md transition-all duration-500 ease-out animate-grow-up ring-1 ring-emerald-500/10"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                      </span>
                      <span>Análise de contexto concluída</span>
                    </div>
                    <span className="rounded-full bg-emerald-50/90 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-800 ring-1 ring-emerald-200/70 shadow-2xs">
                      Prioridade Máxima
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-[#5A6372]">
                    Mensagem classificada como{' '}
                    <strong className="text-[#464B5F] font-semibold">Lead Quente</strong>. Cliente
                    com decisão imediata para time de 5 pessoas. Sugestão de resposta pronta na
                    próxima etapa.
                  </p>
                  <div className="mt-3.5 flex items-center justify-between border-t border-white/80 pt-2.5 text-[11px]">
                    <span className="text-[#7A838E]">Fila sugerida:</span>
                    <span className="inline-flex items-center gap-1.5 font-semibold text-red-600">
                      <AppIcons.queueUrgent className="h-3 w-3 text-red-600" />
                      Responder agora (#1 da fila)
                    </span>
                  </div>
                </div>
              )}

              {/* Cena 1: Sugestão inteligente pronta com envio assistido via Meta */}
              {currentScene === 1 && (
                <div
                  key="scene-1-card"
                  className="ml-11 rounded-2xl border border-white/85 bg-[#F7FCF9]/80 p-4 shadow-xs backdrop-blur-md transition-all duration-500 ease-out animate-grow-up ring-1 ring-emerald-500/15"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[#2D5A40]">
                      <AppIcons.aiSparkleFilled className="h-3.5 w-3.5 text-[#57D067]" />
                      Sugestão pronta pelo assistente
                    </div>
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
                      <AppIcons.shieldSafe className="h-3 w-3 text-emerald-600" />
                      Envio sob seu controle
                    </span>
                  </div>

                  {/* Texto sendo reescrito com efeito de digitação suave */}
                  <p className="mt-2 text-xs leading-relaxed text-[#464B5F] min-h-[48px] font-normal">
                    &quot;{fullDraftText.slice(0, typedChars)}
                    {typedChars < fullDraftText.length && (
                      <span className="inline-block h-3 w-[2px] translate-y-[2px] bg-emerald-500 animate-pulse ml-0.5" />
                    )}
                    &quot;
                  </p>

                  <div className="mt-3.5 flex flex-wrap items-center gap-2 pt-2 border-t border-emerald-100/60">
                    <Button
                      size="sm"
                      onClick={handleSendClick}
                      className={`h-7 rounded-lg px-3 text-[11px] font-medium transition-all duration-200 shadow-xs ${
                        hasSent
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                          : 'bg-[#464B5F] text-white hover:bg-[#373C4F]'
                      }`}
                    >
                      {hasSent ? (
                        <>
                          <AppIcons.check className="mr-1 h-3 w-3" />
                          Enviado pelo assistente!
                        </>
                      ) : (
                        <>
                          <AppIcons.send className="mr-1.5 h-3 w-3" />
                          Enviar pelo assistente
                        </>
                      )}
                    </Button>
                    <button
                      type="button"
                      onClick={handleCopyClick}
                      className="inline-flex items-center gap-1 text-[11px] text-[#7A838E] hover:text-[#464B5F] font-medium transition-colors"
                    >
                      <AppIcons.copy className="h-3 w-3" />
                      {hasCopied ? 'Copiado!' : 'Copiar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenAuth?.('login')}
                      className="text-[11px] text-[#7A838E] hover:text-[#464B5F] font-medium transition-colors"
                    >
                      Ajustar tom
                    </button>
                    <span className="ml-auto text-[10px] text-[#7A838E]">
                      Pressione{' '}
                      <kbd className="rounded border border-[#CBD6D7] bg-white/90 px-1 py-0.2 text-[9px] font-semibold text-[#464B5F]">
                        R
                      </kbd>
                    </span>
                  </div>
                </div>
              )}
              {/* Cena 2: A mesma conversa vira tarefa de follow-up com prazo e lembrete */}
              {currentScene === 2 && (
                <div
                  key="scene-2-card"
                  className="ml-11 rounded-2xl border border-white/85 bg-[#FFFDF9]/80 p-4 shadow-xs backdrop-blur-md transition-all duration-500 ease-out animate-grow-up ring-1 ring-amber-500/15"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-semibold text-amber-900">
                      <AppIcons.queueFollowUps className="h-3.5 w-3.5 text-amber-600" />
                      Follow-up registrado para esta conversa
                    </div>
                    <span className="rounded-full bg-amber-100/90 px-2.5 py-0.5 text-[10px] font-semibold text-amber-900 border border-amber-200/60">
                      Amanhã · 10:00
                    </span>
                  </div>

                  <p className="mt-2 text-xs leading-relaxed text-[#464B5F]">
                    Proposta enviada pelo assistente via API oficial. Lembrete programado para
                    acompanhar o retorno sobre as licenças e condições especiais.
                  </p>

                  <div className="mt-3.5 flex items-center justify-between rounded-xl border border-amber-100/80 bg-white/80 p-2.5 text-xs shadow-2xs backdrop-blur-xs">
                    <div className="flex items-center gap-2 text-[#464B5F]">
                      <AppIcons.checkCircle className="h-4 w-4 text-emerald-600" />
                      <span className="font-medium text-[11px]">Meta de resposta cumprida</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenAuth?.('login')}
                      className="text-[11px] font-medium text-amber-800 hover:underline"
                    >
                      Ver no calendário →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>

        {/* ========================================================================= */}
        {/* COLUNA 3: Painel lateral de Inteligência (muda e remonta conforme o ciclo) */}
        {/* ========================================================================= */}
        <aside className="border-l border-[#CBD6D7]/80 bg-white/65 backdrop-blur-md p-4 max-md:hidden transition-colors">
          {/* Cabeçalho do contato com badge suave */}
          <div className="flex items-center gap-3 border-b border-[#CBD6D7]/70 pb-3.5">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-white/85 border border-white/90 text-xs font-bold text-[#464B5F] shadow-xs backdrop-blur-sm">
              MC
            </div>
            <div className="min-w-0 flex-1">
              <strong className="block truncate text-xs font-semibold text-[#464B5F]">
                Marina Costa
              </strong>
              <span className="block truncate text-[11px] text-[#7A838E]">
                marina@empresa.com.br
              </span>
            </div>
          </div>

          <div className="mt-3.5 space-y-3.5">
            {/* Bloco 1: Tags reativas */}
            <div>
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#8D95A3]">
                  Tags
                </div>
                <span className="text-[9px] text-[#8D95A3]">Dinâmicas</span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5 transition-all duration-300">
                <span
                  className={`rounded-md border px-2 py-0.5 text-[10px] font-medium transition-all duration-300 ${
                    currentScene === 0
                      ? 'border-emerald-300/80 bg-emerald-50/90 text-emerald-700 font-semibold ring-1 ring-emerald-200/60 shadow-2xs'
                      : 'border-[#CBD6D7]/70 bg-white/80 text-[#464B5F]'
                  }`}
                >
                  Lead Quente
                </span>
                <span className="rounded-md border border-[#CBD6D7]/70 bg-white/80 px-2 py-0.5 text-[10px] font-medium text-[#464B5F]">
                  Plano Equipe
                </span>
                <span
                  className={`rounded-md border px-2 py-0.5 text-[10px] font-medium transition-all duration-300 ${
                    currentScene === 2
                      ? 'border-amber-300/80 bg-amber-50/90 text-amber-800 font-semibold ring-1 ring-amber-200/60 shadow-2xs'
                      : 'border-[#CBD6D7]/70 bg-white/80 text-[#464B5F]'
                  }`}
                >
                  {currentScene === 2 ? 'Follow-up amanhã 10h' : 'Sem resposta há 26h'}
                </span>
              </div>
            </div>

            {/* Bloco 2: Inteligência do Atendente reescrita para cada cena (Glass card) */}
            <div>
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#8D95A3]">
                  Inteligência do Atendente
                </div>
                <AppIcons.aiSparkle className="h-3 w-3 text-[#8D95A3]" />
              </div>
              <div className="mt-1.5 rounded-xl border border-white/85 bg-white/75 p-3 text-xs leading-relaxed text-[#5A6372] shadow-xs backdrop-blur-sm transition-all duration-300">
                <p>
                  {currentScene === 0 &&
                    'Lê e prioriza: lead com alta intenção de compra imediata. Conversa colocada no topo da fila para atendimento imediato.'}
                  {currentScene === 1 &&
                    'Sugere e envia: rascunho formulado sob medida para o time de 5 pessoas e enviado com 1 clique pela API oficial da Meta.'}
                  {currentScene === 2 &&
                    'Ciclo completo concluído: resposta enviada e follow-up programado automaticamente para garantir que o lead não esfrie.'}
                </p>
              </div>
            </div>

            {/* Bloco 3: Próxima ação recomendada */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#8D95A3]">
                Próxima Ação Recomendada
              </div>
              <div
                className={`mt-1.5 flex items-center justify-between rounded-xl border p-2.5 text-xs transition-all duration-300 shadow-2xs ${
                  currentScene === 2
                    ? 'border-amber-200/80 bg-amber-50/80 text-amber-900 font-medium'
                    : 'border-white/85 bg-white/75 text-[#464B5F]'
                }`}
              >
                <span className="font-medium">
                  {currentScene === 0 && 'Priorizar na fila'}
                  {currentScene === 1 && 'Enviar resposta sugerida'}
                  {currentScene === 2 && 'Acompanhar amanhã às 10h'}
                </span>
                <AppIcons.arrowUpRight className="h-3.5 w-3.5 text-[#7A838E]" />
              </div>
            </div>

            {/* Micro banner de segurança Fernand */}
            <div className="rounded-xl border border-white/80 bg-white/60 p-2.5 text-[10px] text-[#5A6372] shadow-2xs backdrop-blur-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-medium text-[#464B5F]">
                  <AppIcons.shieldSafe className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span>API Oficial Meta</span>
                </div>
                <a
                  href={ZERNIO_REFERRAL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[9px] text-[#2C8A55] hover:underline"
                  title="Conhecer Zernio"
                >
                  <ZernioLogo height={11} raw />
                  <span>↗</span>
                </a>
              </div>
              <p className="mt-1 text-[10px] leading-tight text-[#7A838E]">
                Lê, prioriza, sugere e envia via Zernio com zero risco de bloqueio.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
