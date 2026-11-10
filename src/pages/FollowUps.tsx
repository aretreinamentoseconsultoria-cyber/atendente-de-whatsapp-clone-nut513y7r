import { useMemo, useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppIcons } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import FollowUpDialog from '@/components/FollowUpDialog'
import { useCrm } from '@/contexts/CrmContext'
import { fullDate, relativeTime, shortDate } from '@/lib/format'
import { ZernioLogo, ZERNIO_REFERRAL_URL } from '@/components/ZernioLogo'

type FollowUpFilter = 'all' | 'overdue' | 'today' | 'upcoming'

export default function FollowUps() {
  const {
    conversations,
    followUps,
    completeFollowUp,
    activeAccount,
    filteredConversations,
    setSelectedAccountId,
    knownAccounts,
    selectedAccountId,
    zernioSettings,
    triggerSync,
    syncing,
  } = useCrm()
  const navigate = useNavigate()

  const [openDialog, setOpenDialog] = useState(false)
  const [filterTab, setFilterTab] = useState<FollowUpFilter>('all')
  const [searchFollowUp, setSearchFollowUp] = useState('')

  // Menu popup do perfil (respeitando o mesmo estilo do rail da Inbox)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false)
      }
    }
    if (profileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [profileMenuOpen])

  // Filtra follow-ups respeitando o perfil global ativo (via CrmContext)
  const relevantConversations = filteredConversations

  const allPending = useMemo(() => {
    return followUps
      .filter((item) => {
        if (item.done) return false
        // Se há filtro por conta, apenas follow-ups pertencentes às conversas desse número
        return relevantConversations.some((c) => c.id === item.conversation)
      })
      .sort((a, b) => a.due_at.localeCompare(b.due_at))
  }, [followUps, relevantConversations])

  const counts = useMemo(() => {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const endOfToday = startOfToday + 24 * 60 * 60 * 1000

    let overdue = 0
    let today = 0
    let upcoming = 0

    allPending.forEach((item) => {
      const dueTime = new Date(item.due_at).getTime()
      if (dueTime < now.getTime()) {
        overdue++
      } else if (dueTime >= startOfToday && dueTime < endOfToday) {
        today++
      } else {
        upcoming++
      }
    })

    return {
      all: allPending.length,
      overdue,
      today,
      upcoming,
    }
  }, [allPending])

  const filteredList = useMemo(() => {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const endOfToday = startOfToday + 24 * 60 * 60 * 1000

    return allPending.filter((item) => {
      const dueTime = new Date(item.due_at).getTime()
      if (filterTab === 'overdue' && dueTime >= now.getTime()) return false
      if (filterTab === 'today' && (dueTime < startOfToday || dueTime >= endOfToday)) return false
      if (filterTab === 'upcoming' && dueTime < endOfToday) return false

      if (searchFollowUp.trim()) {
        const q = searchFollowUp.toLowerCase()
        const convo = conversations.find((c) => c.id === item.conversation)
        const titleMatch = (item.title || '').toLowerCase().includes(q)
        const nameMatch = (convo?.name || '').toLowerCase().includes(q)
        const phoneMatch = (convo?.phone || '').includes(q)
        if (!titleMatch && !nameMatch && !phoneMatch) return false
      }
      return true
    })
  }, [allPending, filterTab, searchFollowUp, conversations])

  // Lista de conversas disponíveis para criar novo follow-up
  const availableConversations = useMemo(() => {
    return relevantConversations.map((c) => ({
      id: c.id,
      name: c.name || c.phone || 'Conversa sem nome',
      phone: c.phone,
    }))
  }, [relevantConversations])

  return (
    <div className="h-full w-full overflow-y-auto overscroll-contain bg-[#F8FAFA] text-[#464B5F]">
      <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Banner do perfil ativo quando filtrado */}
        {activeAccount && (
          <div className="flex items-center justify-between rounded-xl border border-[#E4C8CF] bg-[#FDF4F6] px-4 py-2 text-xs text-[#7B2D3B]">
            <div className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: activeAccount.color }}
              />
              <span className="font-semibold text-xs">
                Filtrando follow-ups de: {activeAccount.name} ({activeAccount.phone})
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedAccountId('all')}
              className="text-xs font-medium underline hover:text-[#521C26] transition-colors"
            >
              Ver todos os números
            </button>
          </div>
        )}

        {/* CABEÇALHO DA PÁGINA (Padrão Fernand: Título limpo, chip do filtro global integrado e botão de ação) */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#CBD6D7] pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-orange-50 border border-orange-200/80 text-[#EA580C]">
                <AppIcons.moduleFollowUps className="h-4 w-4" />
              </span>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#353B47]">
                Agenda de Follow-ups
              </h1>
            </div>
            <p className="mt-1 text-xs text-[#7A838D]">
              Retomadas e compromissos sincronizados com as conversas do WhatsApp.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Seletor do filtro global de perfil de WhatsApp integrado na linguagem Fernand */}
            <div ref={profileMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setProfileMenuOpen((prev) => !prev)}
                className={`flex h-9 items-center gap-2 rounded-xl border px-3 text-xs transition-all ${
                  activeAccount
                    ? 'border-[#E4C8CF] bg-[#FDF4F6] text-[#7B2D3B] font-semibold'
                    : 'border-[#CBD6D7] bg-white text-[#464B5F] hover:bg-[#F2F5F5]'
                }`}
                title="Filtrar por perfil de WhatsApp"
                aria-expanded={profileMenuOpen}
              >
                {activeAccount ? (
                  <>
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: activeAccount.color }}
                    />
                    <span className="truncate max-w-[140px]">{activeAccount.name}</span>
                  </>
                ) : (
                  <>
                    <AppIcons.allProfiles className="h-3.5 w-3.5 text-[#5F6D7C]" />
                    <span>Todos os perfis</span>
                  </>
                )}
                <AppIcons.chevronDown
                  className={`h-3 w-3 text-[#7A838E] transition-transform duration-150 ${
                    profileMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* Menu dropdown de perfis (mesmo padrão do rail da Inbox com pin vinho #7B2D3B) */}
              {profileMenuOpen && (
                <div
                  role="dialog"
                  aria-label="Selecionar perfil de WhatsApp"
                  className="animate-grow-up absolute right-0 top-full mt-1.5 w-64 rounded-xl border border-[#CBD6D7] bg-white shadow-elevation overflow-hidden z-50 text-[#464B5F]"
                >
                  <div className="flex items-center justify-between px-3 py-2 border-b border-[#EAEFEF] bg-[#FAFBFB]">
                    <div>
                      <h4 className="text-[11px] font-bold text-[#353B47] uppercase tracking-wide">
                        Perfil WhatsApp
                      </h4>
                      <p className="text-[10px] text-[#858D97]">Filtro global do sistema</p>
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

                  <div className="divide-y divide-[#EAEFEF] max-h-60 overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAccountId('all')
                        setProfileMenuOpen(false)
                      }}
                      className={`flex w-full items-center justify-between px-3 py-2 text-xs text-left transition-colors ${
                        selectedAccountId === 'all'
                          ? 'bg-[#FDF4F6] text-[#7B2D3B] font-medium'
                          : 'hover:bg-[#F8FAFA] text-[#464B5F]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <AppIcons.allProfiles className="h-3.5 w-3.5 text-[#5F6D7C]" />
                        <span>Todos os perfis</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold tabular-nums">
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
                          className={`flex w-full items-center justify-between px-3 py-2 text-xs text-left transition-colors ${
                            isSelected
                              ? 'bg-[#FDF4F6] text-[#7B2D3B] font-medium'
                              : 'hover:bg-[#F8FAFA] text-[#464B5F]'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="h-2 w-2 rounded-full shrink-0"
                              style={{ backgroundColor: acc.color }}
                            />
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold">{acc.name}</p>
                              <p className="truncate text-[10px] text-[#858D97]">{acc.phone}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 pl-2">
                            <span className="text-[11px] font-semibold tabular-nums">
                              {acc.count}
                            </span>
                            {isSelected && (
                              <AppIcons.pinFilled className="h-3 w-3 text-[#7B2D3B]" />
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  {zernioSettings?.is_connected && (
                    <div className="px-3 py-2 border-t border-[#EAEFEF] bg-[#FAFBFB] flex items-center justify-between text-[10px]">
                      <a
                        href={ZERNIO_REFERRAL_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#858D97] hover:text-[#2C8A55] flex items-center gap-1.5 transition-colors"
                        title="Zernio WhatsApp"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                        <ZernioLogo height={11} raw />
                        <span>↗</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          triggerSync()
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

            {/* Botão de Adicionar Follow-up */}
            <Button
              onClick={() => setOpenDialog(true)}
              className="h-9 rounded-xl bg-[#464B5F] text-xs font-semibold text-white hover:bg-[#373C4F] shadow-xs"
            >
              <AppIcons.check className="mr-1.5 h-3.5 w-3.5" />
              Adicionar follow-up
            </Button>
          </div>
        </div>

        {/* CARDS DAS "CAIXAS" / FILAS DE FOLLOW-UP (Alinhadas ao padrão das caixas da Inbox) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Caixa 1: Todas pendentes */}
          <button
            type="button"
            onClick={() => setFilterTab('all')}
            className={`rounded-xl border p-3.5 text-left transition-all ${
              filterTab === 'all'
                ? 'border-[#7B2D3B]/40 bg-[#FDF4F6] text-[#7B2D3B] shadow-xs ring-1 ring-[#7B2D3B]/20'
                : 'border-[#CBD6D7] bg-white text-[#464B5F] hover:border-[#AFC2BE] hover:bg-[#FAFBFB]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#68717E]">Todas as pendentes</span>
              <AppIcons.queueFollowUps
                className={`h-4 w-4 ${filterTab === 'all' ? 'text-[#7B2D3B]' : 'text-[#F97316]'}`}
              />
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">{counts.all}</p>
          </button>

          {/* Caixa 2: Vencidas */}
          <button
            type="button"
            onClick={() => setFilterTab('overdue')}
            className={`rounded-xl border p-3.5 text-left transition-all ${
              filterTab === 'overdue'
                ? 'border-rose-300 bg-rose-50 text-rose-800 shadow-xs ring-1 ring-rose-200'
                : 'border-[#CBD6D7] bg-white text-[#464B5F] hover:border-[#AFC2BE] hover:bg-[#FAFBFB]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#68717E]">Vencidas</span>
              <AppIcons.warningCircle
                className={`h-4 w-4 ${filterTab === 'overdue' ? 'text-rose-700' : 'text-rose-500'}`}
              />
            </div>
            <p
              className={`mt-2 text-2xl font-bold tracking-tight tabular-nums ${
                counts.overdue > 0 ? 'text-rose-600' : 'text-[#464B5F]'
              }`}
            >
              {counts.overdue}
            </p>
          </button>

          {/* Caixa 3: Para hoje */}
          <button
            type="button"
            onClick={() => setFilterTab('today')}
            className={`rounded-xl border p-3.5 text-left transition-all ${
              filterTab === 'today'
                ? 'border-amber-300 bg-amber-50 text-amber-900 shadow-xs ring-1 ring-amber-200'
                : 'border-[#CBD6D7] bg-white text-[#464B5F] hover:border-[#AFC2BE] hover:bg-[#FAFBFB]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#68717E]">Para hoje</span>
              <AppIcons.queueTracking
                className={`h-4 w-4 ${filterTab === 'today' ? 'text-amber-700' : 'text-[#EA580C]'}`}
              />
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">{counts.today}</p>
          </button>

          {/* Caixa 4: Próximos dias */}
          <button
            type="button"
            onClick={() => setFilterTab('upcoming')}
            className={`rounded-xl border p-3.5 text-left transition-all ${
              filterTab === 'upcoming'
                ? 'border-emerald-300 bg-emerald-50 text-emerald-900 shadow-xs ring-1 ring-emerald-200'
                : 'border-[#CBD6D7] bg-white text-[#464B5F] hover:border-[#AFC2BE] hover:bg-[#FAFBFB]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#68717E]">Próximos dias</span>
              <AppIcons.queueFollowUps
                className={`h-4 w-4 ${
                  filterTab === 'upcoming' ? 'text-emerald-700' : 'text-[#10B981]'
                }`}
              />
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">{counts.upcoming}</p>
          </button>
        </div>

        {/* BARRA DE FILTRO / BUSCA RÁPIDA DE FOLLOW-UPS */}
        <div className="flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <AppIcons.search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[#858D97]" />
            <input
              type="text"
              value={searchFollowUp}
              onChange={(e) => setSearchFollowUp(e.target.value)}
              placeholder="Buscar tarefa ou contato..."
              className="h-8 w-full rounded-xl border border-[#CBD6D7] bg-white pl-8 pr-3 text-xs text-[#353B47] placeholder:text-[#858D97] focus:outline-none focus:ring-1 focus:ring-[#CBD6D7]"
            />
            {searchFollowUp && (
              <button
                type="button"
                onClick={() => setSearchFollowUp('')}
                className="absolute right-2.5 top-2 text-[#858D97] hover:text-[#464B5F]"
              >
                <AppIcons.close className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-[#68717E]">
            <span>Exibindo:</span>
            <span className="font-bold tabular-nums text-[#353B47]">{filteredList.length}</span>
            <span>de {allPending.length}</span>
          </div>
        </div>

        {/* CONTAINER EM ESTILO DE CAIXA DA INBOX COM DIVISÓRIAS FINAS */}
        <div className="overflow-hidden rounded-xl border border-[#CBD6D7] bg-white shadow-2xs">
          {/* Header da lista estilo fila da Inbox (tipografia discreta, sem caixas altas pesadas) */}
          <div className="flex items-center justify-between border-b border-[#CBD6D7] bg-[#F8FAFA] px-4 sm:px-5 py-2.5 text-xs font-semibold text-[#5F6D7C]">
            <div className="flex items-center gap-2">
              <span>Conversa & Tarefa</span>
            </div>
            <div className="hidden sm:flex items-center gap-12 mr-28 text-right">
              <span>Prazo de retomada</span>
            </div>
            <span className="text-right">Ação</span>
          </div>

          {/* Itens da fila de follow-ups com divisórias finas #EAEFEF */}
          <div className="divide-y divide-[#EAEFEF]">
            {filteredList.map((item) => {
              const conversation = conversations.find((convo) => convo.id === item.conversation)
              const overdue = new Date(item.due_at) < new Date()
              const dueObj = new Date(item.due_at)
              const isToday = new Date().toDateString() === dueObj.toDateString()

              return (
                <div
                  key={item.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-5 py-3.5 hover:bg-[#FAFBFB] transition-colors"
                >
                  {/* Lado Esquerdo: Ícone PostHog style + Título + Nome da conversa / número */}
                  <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                    <div
                      className={`grid h-8 w-8 place-items-center rounded-xl border shrink-0 ${
                        overdue
                          ? 'border-rose-200 bg-rose-50 text-rose-600'
                          : isToday
                            ? 'border-amber-200/80 bg-amber-50 text-[#EA580C]'
                            : 'border-emerald-200/80 bg-emerald-50 text-[#10B981]'
                      }`}
                    >
                      {overdue ? (
                        <AppIcons.warningCircle className="h-4 w-4 text-rose-600" />
                      ) : (
                        <AppIcons.queueFollowUps className="h-4 w-4" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs sm:text-sm font-semibold text-[#353B47] truncate">
                          {item.title}
                        </p>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-semibold border ${
                            overdue
                              ? 'border-rose-200 bg-rose-50 text-rose-700'
                              : isToday
                                ? 'border-amber-200 bg-amber-50 text-amber-700'
                                : 'border-[#CBD6D7] bg-[#F8FAFA] text-[#5F6D7C]'
                          }`}
                        >
                          {overdue ? 'Vencido' : isToday ? 'Para hoje' : 'Agendado'}
                        </span>
                      </div>

                      <div className="mt-0.5 flex items-center gap-2 text-xs text-[#858D97] truncate">
                        <button
                          type="button"
                          onClick={() => {
                            if (conversation?.id) {
                              navigate('/inbox')
                            }
                          }}
                          className="hover:text-[#3B82F6] hover:underline font-medium text-[#5F6D7C] truncate"
                          title="Abrir na Inbox"
                        >
                          {conversation?.name || conversation?.phone || 'Conversa associada'}
                        </button>
                        {conversation?.phone && (
                          <span className="hidden sm:inline text-[10px] text-[#A0A8B0]">
                            · {conversation.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Lado Direito: Prazo em números tabulares + Botões de ação alinhados */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 shrink-0 pl-11 sm:pl-0">
                    <div className="text-left sm:text-right">
                      <p className="text-xs font-semibold tabular-nums text-[#353B47]">
                        {shortDate(item.due_at)}
                      </p>
                      <p className="text-[10px] text-[#858D97] tabular-nums">
                        {fullDate(item.due_at).split(' ')[1] || relativeTime(item.due_at)}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* Botão Ver conversa na Inbox */}
                      {conversation && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate('/inbox')}
                          className="h-8 rounded-lg px-2 text-xs text-[#5F6D7C] hover:text-[#353B47] hover:bg-[#EEF2F2]"
                          title="Ir para conversa na Inbox"
                        >
                          <AppIcons.arrowNavRight className="h-3.5 w-3.5" />
                        </Button>
                      )}

                      {/* Botão Concluir com visual de sucesso */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void completeFollowUp(item.id)}
                        className="h-8 rounded-lg border-[#CBD6D7] bg-white text-xs font-medium text-[#464B5F] hover:bg-[#F2FAF6] hover:text-[#295F4D] hover:border-[#BFD9CF] shadow-2xs"
                      >
                        <AppIcons.check className="mr-1.5 h-3.5 w-3.5 text-[#3FB980]" />
                        Concluir
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* ESTADO VAZIO COERENTE COM O DA INBOX ("Fila em dia") */}
          {!filteredList.length && (
            <div className="p-10 sm:p-14 text-center">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-[#10B981] border border-emerald-100">
                <AppIcons.checkCircle className="h-6 w-6 text-[#10B981]" />
              </div>
              <h3 className="text-sm font-bold text-[#353B47]">
                {filterTab === 'all'
                  ? 'Tudo concluído!'
                  : filterTab === 'overdue'
                    ? 'Nenhum follow-up vencido'
                    : filterTab === 'today'
                      ? 'Nenhuma retomada pendente para hoje'
                      : 'Nenhum follow-up nos próximos dias'}
              </h3>
              <p className="mt-1 text-xs text-[#858D97] max-w-sm mx-auto">
                {filterTab === 'all'
                  ? 'Sua agenda de retomadas está em dia. Adicione um novo compromisso para planejar contatos futuros.'
                  : 'Você pode alternar entre as caixas acima para consultar outros períodos.'}
              </p>
              <div className="mt-4">
                <Button
                  onClick={() => setOpenDialog(true)}
                  variant="outline"
                  size="sm"
                  className="rounded-lg border-[#CBD6D7] text-xs text-[#464B5F] hover:bg-[#F8FAFA]"
                >
                  <AppIcons.queueFollowUps className="mr-1.5 h-3.5 w-3.5" />
                  Criar novo follow-up
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* DIÁLOGO LIMPO PARA ADICIONAR FOLLOW-UP */}
        <FollowUpDialog
          open={openDialog}
          onOpenChange={setOpenDialog}
          conversationsList={availableConversations}
        />
      </div>
    </div>
  )
}
