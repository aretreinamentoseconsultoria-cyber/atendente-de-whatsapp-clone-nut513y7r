import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppIcons } from '@/lib/icons'
import { useCrm } from '@/contexts/CrmContext'
import { useAuth } from '@/contexts/AuthContext'
import { ZernioLogo, ZERNIO_REFERRAL_URL } from '@/components/ZernioLogo'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { sanitizeDisplayName } from '@/lib/format'

export type InboxQueue = 'responder' | 'followups' | 'madrugada' | 'acompanhamento' | 'todas'

interface InboxSidebarProps {
  currentQueue?: InboxQueue
  onSelectQueue?: (queue: InboxQueue) => void
  /** Força o rail a comportar-se como colapsado ou expandido se controlado de fora */
  sidebarOpen?: boolean
  onToggleSidebar?: () => void
  /** Se estamos na página de configurações */
  isSettingsPage?: boolean
}

interface StoredSidebarLayout {
  sidebarOpen: boolean
}

const getSidebarLayoutKey = (userId?: string) =>
  userId ? `fernand_inbox_column_layout_${userId}` : 'fernand_inbox_layout_guest'

export function InboxSidebar({
  currentQueue,
  onSelectQueue,
  sidebarOpen: controlledSidebarOpen,
  onToggleSidebar: controlledToggleSidebar,
  isSettingsPage = false,
}: InboxSidebarProps) {
  const {
    conversations,
    followUps,
    zernioSettings,
    selectedAccountId,
    setSelectedAccountId,
    knownAccounts,
    activeAccount,
    syncing,
    triggerSync,
  } = useCrm()
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  // Layout responsivo persistente se não controlado
  const [localSidebarOpen, setLocalSidebarOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    try {
      const key = getSidebarLayoutKey(user?.id)
      const raw = localStorage.getItem(key)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<StoredSidebarLayout>
        return typeof parsed.sidebarOpen === 'boolean' ? parsed.sidebarOpen : true
      }
    } catch {
      // ignore
    }
    return true
  })

  const [sidebarPeeking, setSidebarPeeking] = useState(false)
  const sidebarHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isControlled = typeof controlledSidebarOpen === 'boolean'
  const isFixedOpen = isControlled ? controlledSidebarOpen : localSidebarOpen
  const isSidebarExpanded = isFixedOpen || sidebarPeeking

  const toggleSidebar = () => {
    if (isControlled && controlledToggleSidebar) {
      controlledToggleSidebar()
    } else {
      setLocalSidebarOpen((prev) => {
        const next = !prev
        try {
          const key = getSidebarLayoutKey(user?.id)
          const raw = localStorage.getItem(key)
          const current = raw ? JSON.parse(raw) : {}
          localStorage.setItem(key, JSON.stringify({ ...current, sidebarOpen: next }))
        } catch {
          // ignore
        }
        return next
      })
    }
    setSidebarPeeking(false)
  }

  const handleSidebarMouseEnter = () => {
    if (isFixedOpen) return
    if (sidebarHoverTimer.current) clearTimeout(sidebarHoverTimer.current)
    sidebarHoverTimer.current = setTimeout(() => {
      setSidebarPeeking(true)
    }, 120)
  }

  const handleSidebarMouseLeave = () => {
    if (sidebarHoverTimer.current) clearTimeout(sidebarHoverTimer.current)
    sidebarHoverTimer.current = setTimeout(() => {
      setSidebarPeeking(false)
    }, 150)
  }

  // Seletor de perfis no topo do rail
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement>(null)

  // Menu popup da Inbox flutuante (quando acionado no rail inferior)
  const [activeBottomMenu, setActiveBottomMenu] = useState<'inbox' | null>(null)
  const bottomMenuRef = useRef<HTMLDivElement>(null)

  // Painel de perfil expandível in-line acima do rodapé
  const [isProfileExpanded, setIsProfileExpanded] = useState(false)
  const profilePanelRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll para garantir que o painel e rodapé fiquem visíveis ao expandir
  useEffect(() => {
    if (isProfileExpanded) {
      // Pequeno timeout para sincronizar com início da animação de abertura
      const timer = setTimeout(() => {
        profilePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [isProfileExpanded])

  // Fecha os menus flutuantes ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false)
      }
      if (bottomMenuRef.current && !bottomMenuRef.current.contains(event.target as Node)) {
        setActiveBottomMenu(null)
      }
    }
    if (profileMenuOpen || activeBottomMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [profileMenuOpen, activeBottomMenu])

  const accountFilteredConversations =
    selectedAccountId !== 'all'
      ? conversations.filter((c) => c.zernio_account_id === selectedAccountId)
      : conversations

  const pendingFollowUps = followUps.filter((item) => !item.done)
  const counts = {
    responder: accountFilteredConversations.filter(
      (item) => item.status === 'sem_resposta' && item.last_direction === 'in',
    ).length,
    followups: accountFilteredConversations.filter((item) =>
      pendingFollowUps.some((follow) => follow.conversation === item.id),
    ).length,
    madrugada: accountFilteredConversations.filter((item) => item.status === 'madrugada').length,
    acompanhamento: accountFilteredConversations.filter(
      (item) =>
        item.status === 'acompanhamento' ||
        item.status === 'respondida' ||
        item.last_direction === 'out',
    ).length,
    todas: accountFilteredConversations.length,
  }

  const handleQueueClick = (q: InboxQueue) => {
    if (onSelectQueue) {
      onSelectQueue(q)
    } else {
      // Se estamos em outra página e o usuário clica numa fila, navega para a inbox
      navigate('/inbox')
    }
  }

  const handleSync = async () => {
    await triggerSync()
  }

  return (
    <aside
      onMouseEnter={handleSidebarMouseEnter}
      onMouseLeave={handleSidebarMouseLeave}
      className={`hidden md:flex flex-col shrink-0 border-r border-[#CBD6D7]/80 bg-[#F8FAFA]/95 backdrop-blur-md transition-[width] duration-200 ease-out relative z-20 ${
        isSidebarExpanded ? 'w-[220px]' : 'w-[60px]'
      }`}
      aria-label="Filas e navegação da inbox"
    >
      {/* Topo da sidebar de filas: SELETOR GLOBAL DE PERFIS DE WHATSAPP */}
      <div
        ref={profileMenuRef}
        className="relative flex h-14 shrink-0 items-center justify-between border-b border-[#CBD6D7] px-2.5"
      >
        {isSidebarExpanded ? (
          <div className="flex items-center justify-between w-full gap-1">
            <button
              type="button"
              onClick={() => setProfileMenuOpen((prev) => !prev)}
              className={`flex-1 min-w-0 flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-all border ${
                profileMenuOpen
                  ? 'bg-white border-[#CBD6D7] shadow-xs'
                  : 'bg-[#F2F5F5]/60 border-transparent hover:bg-white hover:border-[#CBD6D7]'
              }`}
              title="Filtrar sistema por perfil de WhatsApp"
              aria-expanded={profileMenuOpen}
              aria-haspopup="dialog"
            >
              {activeAccount?.avatarUrl ? (
                <img
                  src={activeAccount.avatarUrl}
                  alt=""
                  className="h-6 w-6 rounded-md object-cover border border-[#CBD6D7] shrink-0"
                />
              ) : activeAccount ? (
                <span
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-white font-bold text-[10px]"
                  style={{ backgroundColor: activeAccount.color }}
                >
                  {activeAccount.name.slice(0, 1).toUpperCase()}
                </span>
              ) : knownAccounts.length > 0 ? (
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[#464B5F] text-white">
                  <AppIcons.allProfiles className="h-3 w-3" />
                </span>
              ) : (
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[#CBD6D7] text-white">
                  <AppIcons.phoneDevice className="h-3.5 w-3.5" />
                </span>
              )}

              <div className="min-w-0 flex-1">
                <p className="font-semibold text-xs text-[#353B47] truncate leading-tight">
                  {activeAccount
                    ? activeAccount.name
                    : knownAccounts.length > 0
                      ? 'Todos os perfis'
                      : 'Conectar WhatsApp'}
                </p>
                <p className="text-[10px] text-[#858D97] truncate leading-tight">
                  {activeAccount
                    ? `${activeAccount.phone} · ${activeAccount.count}`
                    : knownAccounts.length > 0
                      ? `${conversations.length} conversas`
                      : 'Nenhuma conta vinculada'}
                </p>
              </div>
              <AppIcons.chevronDown
                className={`h-3 w-3 shrink-0 text-[#7A838E] transition-transform duration-150 ${
                  profileMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* Botão de fixar/desafixar rail da sidebar */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={toggleSidebar}
                  aria-label={
                    isFixedOpen
                      ? 'Desafixar coluna de filas (colapsar)'
                      : 'Fixar coluna de filas aberta'
                  }
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-medium transition-colors border ${
                    isFixedOpen
                      ? 'border-[#7B2D3B]/40 bg-[#FDF4F6] text-[#7B2D3B]'
                      : 'border-[#CBD6D7] bg-white text-[#5F6D7C] hover:bg-[#EEF2F2] hover:text-[#464B5F]'
                  }`}
                >
                  {isFixedOpen ? (
                    <AppIcons.pinFilled className="h-3 w-3 text-[#7B2D3B]" />
                  ) : (
                    <AppIcons.pinSlash className="h-3 w-3 text-[#7A838E]" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {isFixedOpen
                  ? 'Desafixar coluna (fechar para rail)'
                  : 'Fixar coluna de filas aberta'}
              </TooltipContent>
            </Tooltip>
          </div>
        ) : (
          <div className="mx-auto flex flex-col items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setProfileMenuOpen((prev) => !prev)}
                  className="relative grid h-8 w-8 place-items-center rounded-lg border border-[#CBD6D7] bg-white text-[#464B5F] hover:bg-[#EEF2F2] transition-colors"
                  aria-label={`Filtrar por perfil (${activeAccount ? activeAccount.name : 'Todos'})`}
                >
                  {activeAccount?.avatarUrl ? (
                    <img
                      src={activeAccount.avatarUrl}
                      alt=""
                      className="h-6 w-6 rounded-md object-cover"
                    />
                  ) : activeAccount ? (
                    <span
                      className="grid h-6 w-6 place-items-center rounded-md text-white font-bold text-[10px]"
                      style={{ backgroundColor: activeAccount.color }}
                    >
                      {activeAccount.name.slice(0, 1).toUpperCase()}
                    </span>
                  ) : (
                    <AppIcons.allProfiles className="h-3.5 w-3.5 text-[#464B5F]" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p className="font-semibold text-xs">
                  {activeAccount ? activeAccount.name : 'Todos os perfis'}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {activeAccount ? activeAccount.phone : 'Clique para trocar o perfil'}
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* PAINEL FLUTUANTE DE SELEÇÃO DE PERFIL */}
        {profileMenuOpen && (
          <div
            role="dialog"
            aria-label="Seletor de perfis de WhatsApp"
            className="absolute top-full left-1 mt-1.5 w-[260px] rounded-xl border border-[#CBD6D7] bg-white shadow-elevation overflow-hidden z-50 text-[#464B5F]"
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-[#EAEFEF] bg-[#FAFBFB]">
              <div>
                <h4 className="text-[11px] font-bold text-[#353B47] uppercase tracking-wide">
                  Perfil WhatsApp
                </h4>
                <p className="text-[10px] text-[#858D97]">Filtra filas e conversas</p>
              </div>
              <button
                type="button"
                onClick={() => setProfileMenuOpen(false)}
                className="rounded p-1 text-[#8F98A3] hover:bg-[#F2F5F5] hover:text-[#464B5F]"
                aria-label="Fechar seletor"
              >
                <AppIcons.close className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="divide-y divide-[#EAEFEF] max-h-[300px] overflow-y-auto">
              {knownAccounts.length === 0 ? (
                <div className="p-4 text-center">
                  <p className="text-xs font-semibold text-[#353B47]">Nenhuma conta conectada</p>
                  <p className="mt-1 text-[11px] text-[#858D97] leading-relaxed">
                    Conecte seu WhatsApp para sincronizar suas conversas neste painel.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => {
                      setProfileMenuOpen(false)
                      navigate('/configuracoes')
                    }}
                    className="mt-3 w-full bg-[#464B5F] text-xs hover:bg-[#373C4F]"
                  >
                    <AppIcons.phoneDevice className="mr-1.5 h-3.5 w-3.5" />
                    Conectar conta WhatsApp
                  </Button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAccountId('all')
                      setProfileMenuOpen(false)
                    }}
                    className={`flex w-full items-center justify-between px-3 py-2.5 text-xs text-left transition-colors ${
                      selectedAccountId === 'all'
                        ? 'bg-[#FDF4F6] text-[#7B2D3B] font-medium'
                        : 'hover:bg-[#F8FAFA] text-[#464B5F]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-white text-[10px] ${
                          selectedAccountId === 'all' ? 'bg-[#7B2D3B]' : 'bg-[#464B5F]'
                        }`}
                      >
                        <AppIcons.allProfiles className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold leading-tight">
                          Todos os perfis
                        </p>
                        <p className="text-[10px] text-[#858D97] mt-0.5 leading-tight">
                          Visão unificada
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 pl-2">
                      <span
                        className={`text-[11px] font-semibold tabular-nums ${
                          selectedAccountId === 'all' ? 'text-[#7B2D3B]' : 'text-[#68717E]'
                        }`}
                      >
                        {conversations.length}
                      </span>
                      {selectedAccountId === 'all' && (
                        <AppIcons.pinFilled className="h-3 w-3 text-[#7B2D3B]" />
                      )}
                    </div>
                  </button>

                  {knownAccounts.map((acc) => {
                    const isSelected = selectedAccountId === acc.id
                    return (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => {
                          setSelectedAccountId(acc.id)
                          setProfileMenuOpen(false)
                        }}
                        className={`flex w-full items-center justify-between px-3 py-2.5 text-xs text-left transition-colors ${
                          isSelected
                            ? 'bg-[#FDF4F6] text-[#7B2D3B] font-medium'
                            : 'hover:bg-[#F8FAFA] text-[#464B5F]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {acc.avatarUrl ? (
                            <img
                              src={acc.avatarUrl}
                              alt=""
                              className="h-6 w-6 rounded-md object-cover border border-[#CBD6D7] shrink-0"
                            />
                          ) : (
                            <span
                              className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-white text-[10px] font-bold"
                              style={{ backgroundColor: acc.color }}
                            >
                              {acc.name.slice(0, 1).toUpperCase()}
                            </span>
                          )}
                          <div className="min-w-0">
                            <p
                              className={`truncate text-xs font-semibold leading-tight ${
                                isSelected ? 'text-[#7B2D3B]' : 'text-[#353B47]'
                              }`}
                            >
                              {acc.name}
                            </p>
                            <p className="text-[10px] text-[#858D97] truncate mt-0.5 leading-tight">
                              {acc.phone}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 pl-2">
                          <span
                            className={`text-[11px] font-semibold tabular-nums ${
                              isSelected ? 'text-[#7B2D3B]' : 'text-[#68717E]'
                            }`}
                          >
                            {acc.count}
                          </span>
                          {isSelected && <AppIcons.pinFilled className="h-3 w-3 text-[#7B2D3B]" />}
                        </div>
                      </button>
                    )
                  })}
                </>
              )}
            </div>

            {zernioSettings?.is_connected && (
              <div className="px-3 py-2 border-t border-[#EAEFEF] bg-[#FAFBFB] flex items-center justify-between text-[10px]">
                <span className="text-[#858D97] flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                  Zernio WhatsApp
                </span>
                <button
                  type="button"
                  onClick={() => {
                    handleSync()
                    setProfileMenuOpen(false)
                  }}
                  disabled={syncing}
                  className="flex items-center gap-1 font-medium text-[#3B82F6] hover:text-[#1D4ED8] disabled:opacity-50"
                >
                  <AppIcons.sync className={`h-2.5 w-2.5 ${syncing ? 'animate-spin' : ''}`} />
                  Sincronizar
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Itens das filas da Inbox */}
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-2 space-y-1"
      >
        <SidebarQueueRow
          label="Responder agora"
          icon={AppIcons.queueUrgent}
          count={counts.responder}
          active={currentQueue === 'responder'}
          collapsed={!isSidebarExpanded}
          danger
          iconColor="text-[#EF4444]"
          onClick={() => handleQueueClick('responder')}
        />
        <SidebarQueueRow
          label="Follow-ups"
          icon={AppIcons.queueFollowUps}
          count={counts.followups}
          active={currentQueue === 'followups'}
          collapsed={!isSidebarExpanded}
          iconColor="text-[#F97316]"
          onClick={() => handleQueueClick('followups')}
        />
        <SidebarQueueRow
          label="Madrugada"
          icon={AppIcons.queueNight}
          count={counts.madrugada}
          active={currentQueue === 'madrugada'}
          collapsed={!isSidebarExpanded}
          iconColor="text-[#8B5CF6]"
          onClick={() => handleQueueClick('madrugada')}
        />
        <SidebarQueueRow
          label="Em acompanhamento"
          icon={AppIcons.queueTracking}
          count={counts.acompanhamento}
          active={currentQueue === 'acompanhamento'}
          collapsed={!isSidebarExpanded}
          iconColor="text-[#10B981]"
          onClick={() => handleQueueClick('acompanhamento')}
        />
        <SidebarQueueRow
          label="Todas as conversas"
          icon={AppIcons.queueAll}
          count={counts.todas}
          active={currentQueue === 'todas'}
          collapsed={!isSidebarExpanded}
          iconColor="text-[#3B82F6]"
          onClick={() => handleQueueClick('todas')}
        />

        {/* Bloco Zernio Status */}
        <div className="pt-3">
          {isSidebarExpanded ? (
            <div className="rounded-lg border border-[#DCE4E4] bg-white p-2.5">
              <div className="flex items-center justify-between">
                <a
                  href={ZERNIO_REFERRAL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-[#464B5F] hover:text-[#2C8A55] transition-colors"
                  title="Acessar painel Zernio"
                >
                  <ZernioLogo height={12} raw />
                  <span className="truncate">
                    {activeAccount ? activeAccount.name : 'WhatsApp API'}
                  </span>
                  <span className="text-[9px] text-[#A3A5AF]">↗</span>
                </a>
                {zernioSettings?.is_connected && (
                  <button
                    onClick={handleSync}
                    disabled={syncing}
                    title={`Sincronizar ${activeAccount ? activeAccount.name : 'Zernio'}`}
                    className="text-[#7A838E] hover:text-[#464B5F]"
                    aria-label="Sincronizar Zernio"
                  >
                    <AppIcons.sync className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} />
                  </button>
                )}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[10px]">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    zernioSettings?.is_connected ? 'bg-[#3FB980]' : 'bg-[#AAB3BE]'
                  }`}
                />
                <span className="text-[#6D7783] truncate">
                  {zernioSettings?.is_connected && knownAccounts.length > 0
                    ? activeAccount
                      ? `${activeAccount.name} (${activeAccount.phone})`
                      : knownAccounts.length > 1
                        ? `${knownAccounts.length} números conectados`
                        : knownAccounts.length === 1
                          ? `${knownAccounts[0].name} (${knownAccounts[0].phone})`
                          : zernioSettings?.operation_mode === 'read_write'
                            ? 'Leitura + Envio'
                            : 'Conectado'
                    : 'Desconectado'}
                </span>
              </div>
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleSync}
                  aria-label={`Zernio WhatsApp (${zernioSettings?.is_connected ? 'Conectado' : 'Desconectado'})`}
                  className="flex h-10 w-full items-center justify-center rounded-lg text-[#5F6D7C] hover:bg-white transition-colors"
                >
                  <div className="relative">
                    <AppIcons.zernioGlobe className="h-4 w-4 text-[#4E7766]" />
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-[#F8FAFA] ${
                        zernioSettings?.is_connected ? 'bg-[#3FB980]' : 'bg-[#AAB3BE]'
                      }`}
                    />
                  </div>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p className="font-semibold text-xs">
                  {activeAccount ? activeAccount.name : 'Zernio WhatsApp'}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {zernioSettings?.is_connected
                    ? activeAccount
                      ? `${activeAccount.name} · ${activeAccount.phone}`
                      : `${knownAccounts.length || 1} número(s) conectados`
                    : 'Desconectado'}
                </p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Bloco "Como priorizamos" — visível quando expandido */}
        {isSidebarExpanded && (
          <div className="mt-3 border-t border-[#DDE5E5] pt-3">
            <p className="px-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#929AA3]">
              Como priorizamos
            </p>
            <div className="mt-2 space-y-2 px-2 text-[11px] text-[#737C87]">
              <p className="flex items-center gap-2">
                <AppIcons.tempHot className="h-3.5 w-3.5 text-[#EF4444]" /> Tempo sem resposta
              </p>
              <p className="flex items-center gap-2">
                <AppIcons.tempWarm className="h-3.5 w-3.5 text-[#F59E0B]" /> Temperatura do lead
              </p>
              <p className="flex items-center gap-2">
                <AppIcons.nextAction className="h-3.5 w-3.5 text-[#10B981]" /> Próxima melhor ação
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* BASE DO RAIL: MÓDULO INBOX, CONFIGURAÇÕES E PERFIL                        */}
      {/* ========================================================================= */}
      <div
        ref={bottomMenuRef}
        className="relative shrink-0 border-t border-[#CBD6D7] bg-[#F8FAFA] p-2 space-y-1 z-30"
      >
        {/* Painel popup da Inbox ao clicar no Módulo Inbox */}
        {activeBottomMenu === 'inbox' && (
          <div
            role="dialog"
            aria-label="Módulo Inbox e Filas"
            className="animate-grow-up absolute bottom-full left-2 mb-2 w-[260px] rounded-2xl border border-[#CBD6D7] bg-white p-3 shadow-elevation z-50 text-[#464B5F]"
          >
            <div className="flex items-center justify-between pb-2 border-b border-[#EAEFEF]">
              <div className="flex items-center gap-2">
                <div className="grid h-6 w-6 place-items-center rounded-lg bg-blue-50 text-[#3B82F6] ring-1 ring-blue-100">
                  <AppIcons.moduleInbox className="h-3.5 w-3.5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#353B47]">Módulo Inbox</h4>
                  <p className="text-[10px] text-[#858D97]">Filas de atendimento organizadas</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveBottomMenu(null)}
                className="rounded p-1 text-[#8F98A3] hover:bg-[#F2F5F5] hover:text-[#464B5F]"
                aria-label="Fechar painel"
              >
                <AppIcons.close className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mt-2.5 space-y-1">
              <button
                type="button"
                onClick={() => {
                  handleQueueClick('responder')
                  setActiveBottomMenu(null)
                }}
                className={`flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-xs transition-colors ${
                  currentQueue === 'responder'
                    ? 'bg-white ring-1 ring-[#CBD6D7] font-semibold text-[#353B47] shadow-xs'
                    : 'hover:bg-[#F5F8F8] text-[#555E6C]'
                }`}
              >
                <span className="flex items-center gap-2">
                  <AppIcons.queueUrgent className="h-3.5 w-3.5 text-[#EF4444]" /> Responder agora
                </span>
                <span className="rounded-full bg-[#FFF0EE] px-1.5 py-0.5 text-[10px] font-bold text-[#B74D43] tabular-nums">
                  {counts.responder}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  handleQueueClick('followups')
                  setActiveBottomMenu(null)
                }}
                className={`flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-xs transition-colors ${
                  currentQueue === 'followups'
                    ? 'bg-white ring-1 ring-[#CBD6D7] font-semibold text-[#353B47] shadow-xs'
                    : 'hover:bg-[#F5F8F8] text-[#555E6C]'
                }`}
              >
                <span className="flex items-center gap-2">
                  <AppIcons.queueFollowUps className="h-3.5 w-3.5 text-[#F97316]" /> Follow-ups
                </span>
                <span className="rounded-full bg-[#EDF2F1] px-1.5 py-0.5 text-[10px] font-bold text-[#464B5F] tabular-nums">
                  {counts.followups}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  handleQueueClick('madrugada')
                  setActiveBottomMenu(null)
                }}
                className={`flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-xs transition-colors ${
                  currentQueue === 'madrugada'
                    ? 'bg-white ring-1 ring-[#CBD6D7] font-semibold text-[#353B47] shadow-xs'
                    : 'hover:bg-[#F5F8F8] text-[#555E6C]'
                }`}
              >
                <span className="flex items-center gap-2">
                  <AppIcons.queueNight className="h-3.5 w-3.5 text-[#8B5CF6]" /> Mensagens da
                  madrugada
                </span>
                <span className="rounded-full bg-[#F3EFFB] px-1.5 py-0.5 text-[10px] font-bold text-[#6C58A3] tabular-nums">
                  {counts.madrugada}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  handleQueueClick('acompanhamento')
                  setActiveBottomMenu(null)
                }}
                className={`flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-xs transition-colors ${
                  currentQueue === 'acompanhamento'
                    ? 'bg-white ring-1 ring-[#CBD6D7] font-semibold text-[#353B47] shadow-xs'
                    : 'hover:bg-[#F5F8F8] text-[#555E6C]'
                }`}
              >
                <span className="flex items-center gap-2">
                  <AppIcons.queueTracking className="h-3.5 w-3.5 text-[#10B981]" /> Em
                  acompanhamento
                </span>
                <span className="rounded-full bg-[#EDF2F1] px-1.5 py-0.5 text-[10px] font-bold text-[#464B5F] tabular-nums">
                  {counts.acompanhamento}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  handleQueueClick('todas')
                  setActiveBottomMenu(null)
                }}
                className={`flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-xs transition-colors ${
                  currentQueue === 'todas'
                    ? 'bg-white ring-1 ring-[#CBD6D7] font-semibold text-[#353B47] shadow-xs'
                    : 'hover:bg-[#F5F8F8] text-[#555E6C]'
                }`}
              >
                <span className="flex items-center gap-2">
                  <AppIcons.queueAll className="h-3.5 w-3.5 text-[#3B82F6]" /> Todas as conversas
                </span>
                <span className="rounded-full bg-[#EDF2F1] px-1.5 py-0.5 text-[10px] font-bold text-[#464B5F] tabular-nums">
                  {counts.todas}
                </span>
              </button>
            </div>

            <div className="mt-3 rounded-xl border border-[#CBD6D7] bg-[#F8FBFA] p-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#464B5F]">
                <AppIcons.filterQueue className="h-3.5 w-3.5 text-[#3B82F6]" /> Fila prioritizada
              </div>
              <p className="mt-1 text-[10px] leading-4 text-[#7A838D]">
                Urgência, intenção e tempo sem resposta organizados para você.
              </p>
            </div>
          </div>
        )}

        {/* Painel expandível in-line do Perfil (empurra conteúdo acima) */}
        <div
          ref={profilePanelRef}
          className={`grid transition-[grid-template-rows,opacity,margin] duration-250 ease-out motion-reduce:transition-none ${
            isProfileExpanded
              ? 'grid-rows-[1fr] opacity-100 mb-2'
              : 'grid-rows-[0fr] opacity-0 mb-0 pointer-events-none'
          }`}
          aria-hidden={!isProfileExpanded}
        >
          <div className="overflow-hidden min-h-0">
            <div
              className={`rounded-2xl border border-[#CBD6D7] bg-white text-[#464B5F] shadow-xs transition-transform duration-250 ease-out motion-reduce:transition-none ${
                isSidebarExpanded ? 'p-3' : 'p-2'
              } ${isProfileExpanded ? 'translate-y-0 scale-100' : 'translate-y-1 scale-95'}`}
            >
              {isSidebarExpanded ? (
                <>
                  <div className="flex items-center justify-between pb-2 border-b border-[#EAEFEF]">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#929AA3]">
                      Conta ativa
                    </span>
                  </div>
                  <div className="mt-2.5 flex items-center gap-2.5">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-violet-100 text-xs font-bold text-violet-700 ring-1 ring-violet-200">
                      {sanitizeDisplayName(user?.name, user?.email, 'Minha conta')
                        .slice(0, 1)
                        .toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-[#353B47]">
                        {sanitizeDisplayName(user?.name, user?.email, 'Minha conta')}
                      </p>
                      <p className="truncate text-[10px] text-[#858D97]">{user?.email}</p>
                    </div>
                  </div>

                  <div className="mt-3 border-t border-[#EAEFEF] pt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        logout()
                        navigate('/')
                      }}
                      className="w-full justify-start text-xs text-[#B54E45] hover:bg-[#FFF0EE] hover:text-[#B54E45] h-8"
                    >
                      <AppIcons.logout className="mr-2 h-3.5 w-3.5 text-[#EF4444]" />
                      Sair da conta
                    </Button>
                  </div>
                </>
              ) : (
                /* Versão colapsada da sidebar (largura 60px) */
                <div className="flex flex-col items-center gap-2 py-1">
                  <div
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-violet-100 text-xs font-bold text-violet-700 ring-1 ring-violet-200"
                    title={
                      user?.email || sanitizeDisplayName(user?.name, user?.email, 'Minha conta')
                    }
                  >
                    {sanitizeDisplayName(user?.name, user?.email, 'Minha conta')
                      .slice(0, 1)
                      .toUpperCase()}
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => {
                          logout()
                          navigate('/')
                        }}
                        aria-label="Sair da conta"
                        className="grid h-8 w-8 place-items-center rounded-lg text-[#B54E45] hover:bg-[#FFF0EE] transition-colors"
                      >
                        <AppIcons.logout className="h-4 w-4 text-[#EF4444]" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">Sair da conta</TooltipContent>
                  </Tooltip>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 1. MÓDULO INBOX (Ícone base) */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => {
                if (location.pathname !== '/inbox') {
                  navigate('/inbox')
                } else {
                  setActiveBottomMenu((prev) => (prev === 'inbox' ? null : 'inbox'))
                }
              }}
              aria-label="Módulo Inbox & Filas"
              className={`relative flex h-10 w-full items-center rounded-xl transition-all ${
                isSidebarExpanded ? 'px-3 gap-2.5' : 'justify-center'
              } ${
                location.pathname === '/inbox' || activeBottomMenu === 'inbox'
                  ? 'bg-white text-[#353B47] ring-1 ring-[#CBD6D7] shadow-xs'
                  : 'bg-white border border-[#CBD6D7] text-[#464B5F] hover:bg-[#F2F6F5]'
              }`}
            >
              <AppIcons.moduleInbox className="h-4 w-4 shrink-0 text-[#3B82F6]" />
              {isSidebarExpanded && (
                <span className="truncate text-xs font-bold text-[#353B47]">Módulo Inbox</span>
              )}
              <span
                className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold tabular-nums leading-none ${
                  isSidebarExpanded
                    ? 'ml-auto bg-blue-50 text-[#2563EB] ring-1 ring-blue-100'
                    : 'absolute top-1 right-1 bg-[#3B82F6] text-white shadow-xs'
                }`}
              >
                {counts.responder + counts.followups}
              </span>
            </button>
          </TooltipTrigger>
          {!isSidebarExpanded && (
            <TooltipContent side="right">
              <span className="font-semibold">Módulo Inbox</span> (filas nomeadas)
            </TooltipContent>
          )}
        </Tooltip>

        {/* 2. MÓDULO AGENTE IA */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => navigate('/agente')}
              aria-label="Agente IA"
              className={`relative flex h-10 w-full items-center rounded-xl transition-all ${
                isSidebarExpanded ? 'px-3 gap-2.5' : 'justify-center'
              } ${
                location.pathname === '/agente'
                  ? 'bg-white text-[#353B47] ring-1 ring-[#CBD6D7] shadow-xs'
                  : 'bg-white border border-transparent hover:border-[#CBD6D7] text-[#606A78] hover:text-[#353B47]'
              }`}
            >
              <AppIcons.moduleAgent className="h-4 w-4 shrink-0 text-[#8B5CF6]" />
              {isSidebarExpanded && <span className="truncate text-xs font-medium">Agente IA</span>}
              <span
                className={`rounded-full bg-violet-400 ${
                  isSidebarExpanded
                    ? 'ml-auto h-2 w-2'
                    : 'absolute top-2 right-2 h-2 w-2 ring-1 ring-white'
                }`}
                title="Agente de Conversas Nativo"
              />
            </button>
          </TooltipTrigger>
          {!isSidebarExpanded && (
            <TooltipContent side="right">Agente IA (Conversas)</TooltipContent>
          )}
        </Tooltip>

        {/* 3. MÓDULO CONFIGURAÇÕES */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => navigate('/configuracoes')}
              aria-label="Configurações"
              className={`relative flex h-10 w-full items-center rounded-xl transition-all ${
                isSidebarExpanded ? 'px-3 gap-2.5' : 'justify-center'
              } ${
                location.pathname === '/configuracoes'
                  ? 'bg-white text-[#353B47] ring-1 ring-[#CBD6D7] shadow-xs'
                  : 'bg-white border border-transparent hover:border-[#CBD6D7] text-[#606A78] hover:text-[#353B47]'
              }`}
            >
              <AppIcons.moduleSettings className="h-4 w-4 shrink-0 text-[#6366F1]" />
              {isSidebarExpanded && (
                <span className="truncate text-xs font-medium">Configurações</span>
              )}
              <span
                className={`rounded-full ${
                  zernioSettings?.is_connected ? 'bg-[#10B981]' : 'bg-[#CBD6D7]'
                } ${
                  isSidebarExpanded
                    ? 'ml-auto h-2 w-2'
                    : 'absolute top-2 right-2 h-2 w-2 ring-1 ring-white'
                }`}
                title={zernioSettings?.is_connected ? 'Zernio Conectado' : 'Zernio Desconectado'}
              />
            </button>
          </TooltipTrigger>
          {!isSidebarExpanded && <TooltipContent side="right">Configurações</TooltipContent>}
        </Tooltip>

        {/* 3. PERFIL DO USUÁRIO & LOGOUT */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setIsProfileExpanded((prev) => !prev)}
            aria-expanded={isProfileExpanded}
            aria-label={`Perfil de ${sanitizeDisplayName(user?.name, user?.email, 'Minha conta')}`}
            className={`flex h-10 w-full items-center rounded-xl transition-all ${
              isSidebarExpanded ? 'px-2 gap-2 text-left' : 'justify-center'
            } ${
              isProfileExpanded
                ? 'bg-white ring-1 ring-[#CBD6D7] shadow-xs text-[#353B47]'
                : 'hover:bg-white text-[#464B5F]'
            }`}
          >
            <div
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold transition-all ${
                isProfileExpanded
                  ? 'bg-violet-600 text-white ring-2 ring-violet-300'
                  : 'bg-violet-100 text-violet-700 ring-1 ring-violet-200'
              }`}
              title={user?.email || sanitizeDisplayName(user?.name, user?.email, 'Minha conta')}
            >
              {sanitizeDisplayName(user?.name, user?.email, 'Minha conta')
                .slice(0, 1)
                .toUpperCase()}
            </div>
            {isSidebarExpanded && (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-[#353B47]">
                    {sanitizeDisplayName(user?.name, user?.email, 'Minha conta')}
                  </p>
                  <p className="truncate text-[10px] text-[#858D97]">{user?.email}</p>
                </div>
                <AppIcons.chevronDown
                  className={`h-3 w-3 shrink-0 text-[#7A838E] transition-transform duration-200 motion-reduce:transition-none ${
                    isProfileExpanded ? 'rotate-180 text-violet-600' : ''
                  }`}
                />
              </>
            )}
          </button>
        </div>
      </div>
    </aside>
  )
}

function SidebarQueueRow({
  label,
  icon: Icon,
  iconColor,
  count,
  active,
  collapsed,
  danger,
  onClick,
}: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  iconColor?: string
  count: number
  active: boolean
  collapsed: boolean
  danger?: boolean
  onClick: () => void
}) {
  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            aria-label={`${label} (${count})`}
            className={`relative flex h-10 w-full items-center justify-center rounded-lg transition-colors ${
              active
                ? 'bg-white text-[#3D5F53] ring-1 ring-[#CBD6D7]'
                : 'text-[#707985] hover:bg-white'
            }`}
          >
            <Icon className={`h-4 w-4 ${iconColor || ''}`} />
            {count > 0 && (
              <span
                className={`absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-semibold tabular-nums leading-none ${
                  danger ? 'bg-[#FFF0EE] text-[#B74D43]' : 'bg-[#EDF2F1] text-[#464B5F]'
                }`}
              >
                {count > 99 ? '99+' : count}
              </span>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">
          <span>{label}</span>
          <span className="ml-1.5 font-bold">({count})</span>
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors ${
        active ? 'bg-white text-[#3D5F53] ring-1 ring-[#CBD6D7]' : 'text-[#707985] hover:bg-white'
      }`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${iconColor || ''}`} />
      <span className="flex-1 truncate">{label}</span>
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] tabular-nums font-semibold shrink-0 ${
          danger && count ? 'bg-[#FFF0EE] text-[#B74D43]' : 'bg-[#EDF2F1] text-[#464B5F]'
        }`}
      >
        {count}
      </span>
    </button>
  )
}
