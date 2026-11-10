import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppIcons } from '@/lib/icons'
import { useCrm } from '@/contexts/CrmContext'
import { ZernioLogo, ZERNIO_REFERRAL_URL } from '@/components/ZernioLogo'
import { useOnboarding } from '@/contexts/OnboardingContext'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

export default function ReadOnlyBanner() {
  const {
    conversations,
    followUps,
    zernioSettings,
    searchQuery,
    setSearchQuery,
    syncing,
    triggerSync,
    knownAccounts,
    selectedAccountId,
    setSelectedAccountId,
    activeAccount,
  } = useCrm()
  const [accountSheetOpen, setAccountSheetOpen] = useState(false)
  const { openWizard, needsOnboarding, isSkipped } = useOnboarding()
  const navigate = useNavigate()

  const urgentCount = followUps.filter((f) => !f.done).length
  const isConnected = Boolean(zernioSettings?.is_connected)

  // Banner persistente apenas se o usuário realmente precisa de onboarding (não concluído nem qualificado)
  // ou se pulou voluntariamente sem concluir a configuração. Se o onboarding foi concluído
  // ou está no período de graça com conexão em resolução, não deve exibir banner falso de pendência.
  const showPersistentBanner = needsOnboarding || (isSkipped && !isConnected)
  return (
    <div className="shrink-0 z-30 flex flex-col w-full">
      {/* Banner persistente de conclusão da configuração Zernio */}
      {showPersistentBanner && (
        <aside
          role="status"
          aria-label="Aviso de configuração pendente"
          className="flex h-9 w-full items-center justify-between border-b border-[#F0DFC6] bg-[#FDF8F0] px-3 sm:px-4 text-[11px] text-[#A4671E] animate-grow-up"
        >
          <div className="flex items-center gap-2 truncate">
            <AppIcons.warningCircle className="h-4 w-4 shrink-0 text-[#E5A14C]" />
            <span className="truncate">
              <strong>Configuração pendente:</strong> Sem conectar a{' '}
              <a
                href={ZERNIO_REFERRAL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold underline inline-flex items-center gap-1 hover:text-[#2C8A55]"
              >
                <span>Zernio</span>
                <ZernioLogo height={11} raw />
              </a>
              , sua inbox fica vazia e nada chega ao vivo.
            </span>
          </div>
          <button
            type="button"
            onClick={() => openWizard()}
            className="ml-3 shrink-0 inline-flex items-center gap-1 rounded-md bg-[#464B5F] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#353B47] transition-colors shadow-xs"
          >
            <AppIcons.aiSparkle className="h-3 w-3 text-[#E5A14C]" />
            Concluir configuração (2 min)
          </button>
        </aside>
      )}

      <header className="flex h-11 sm:h-12 w-full items-center justify-between gap-2 sm:gap-3 border-b border-[#CBD6D7] bg-white px-2.5 sm:px-4 text-xs text-[#353B47]">
        {/* Zona Esquerda: Seletor / indicador de perfil ativo (sem logo Alô a pedido do usuário) */}
        <div className="flex items-center gap-2 sm:gap-3 shrink min-w-0">
          {isConnected && activeAccount ? (
            <button
              type="button"
              onClick={() => setAccountSheetOpen(true)}
              className="inline-flex items-center gap-1.5 min-h-[44px] min-w-[44px] py-1 px-2.5 -my-2 rounded-full text-[11px] sm:text-xs font-semibold border border-[#E4C8CF] bg-[#FDF4F6] text-[#7B2D3B] hover:bg-[#FCEAEF] active:scale-95 transition-all touch-manipulation cursor-pointer truncate"
              title={`Conta ativa: ${activeAccount.name} (${activeAccount.phone}). Toque para trocar.`}
              aria-label={`Trocar de telefone/conta. Ativa: ${activeAccount.name}`}
            >
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: activeAccount.color }}
              />
              <span className="max-w-[95px] xs:max-w-[130px] sm:max-w-[170px] truncate">
                {activeAccount.name}
              </span>
              <AppIcons.chevronDown className="h-3 w-3 shrink-0 text-[#7B2D3B]/70" />
            </button>
          ) : isConnected && knownAccounts.length > 0 ? (
            <button
              type="button"
              onClick={() => setAccountSheetOpen(true)}
              className="inline-flex items-center gap-1.5 min-h-[44px] min-w-[44px] py-1 px-2.5 -my-2 rounded-full text-[11px] sm:text-xs font-medium border border-[#CBD6D7] bg-[#F8FAFA] text-[#464B5F] hover:bg-[#EEF2F2] active:scale-95 transition-all touch-manipulation cursor-pointer truncate"
              title="Todas as contas conectadas. Toque para filtrar por telefone."
              aria-label="Trocar de telefone/conta. Visualizando todas as contas."
            >
              <span className="h-2 w-2 rounded-full bg-[#464B5F] shrink-0" />
              <span className="max-w-[95px] xs:max-w-[130px] sm:max-w-[170px] truncate">
                Todas as contas
              </span>
              <AppIcons.chevronDown className="h-3 w-3 shrink-0 text-[#7A838E]" />
            </button>
          ) : isConnected ? null : (
            <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 sm:px-2.5 sm:py-1 text-[10px] sm:text-xs font-medium border border-[#F0DFC6] bg-[#FDF8F0] text-[#A4671E] truncate">
              <span className="h-1.5 w-1.5 rounded-full bg-[#E5A14C] shrink-0" />
              <span className="truncate">WhatsApp desconectado</span>
            </span>
          )}
        </div>

        {/* Bottom Sheet para seleção de telefone/conta (mobile-first) */}
        <Sheet open={accountSheetOpen} onOpenChange={setAccountSheetOpen}>
          <SheetContent
            side="bottom"
            className="rounded-t-2xl border-t border-[#CBD6D7] bg-white p-0 pb-[max(1.25rem,env(safe-area-inset-bottom))] max-h-[85vh] flex flex-col focus:outline-none"
          >
            <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-[#CBD6D7]" aria-hidden="true" />
            <SheetHeader className="px-5 pt-2 pb-3 border-b border-[#EEF2F2] text-left">
              <SheetTitle className="text-base font-bold text-[#353B47] flex items-center gap-2">
                <AppIcons.phoneDevice className="h-4 w-4 text-[#464B5F]" />
                <span>Trocar de telefone / conta</span>
              </SheetTitle>
              <SheetDescription className="text-xs text-[#7A838E]">
                Filtre a inbox para ver as conversas de um número específico ou unifique tudo.
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {/* Opção 1: Todas as contas / visão unificada */}
              <button
                type="button"
                onClick={() => {
                  setSelectedAccountId('all')
                  setAccountSheetOpen(false)
                }}
                className={`w-full min-h-[52px] flex items-center justify-between rounded-xl px-3.5 py-2.5 text-left transition-all touch-manipulation active:scale-[0.99] border ${
                  selectedAccountId === 'all'
                    ? 'border-[#7B2D3B]/40 bg-[#FDF4F6] text-[#7B2D3B] shadow-xs'
                    : 'border-transparent bg-[#F8FAFA] hover:bg-[#EEF2F2] text-[#353B47]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white font-bold text-xs ${
                      selectedAccountId === 'all' ? 'bg-[#7B2D3B]' : 'bg-[#464B5F]'
                    }`}
                  >
                    <AppIcons.allProfiles className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm leading-tight truncate">Todas as contas</p>
                    <p className="text-xs text-[#858D97] mt-0.5 leading-tight truncate">
                      Visão unificada · {conversations.length} conversas
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 pl-2">
                  <span className="rounded-full bg-white/80 border border-[#CBD6D7] px-2 py-0.5 text-xs font-semibold tabular-nums text-[#464B5F]">
                    {conversations.length}
                  </span>
                  {selectedAccountId === 'all' && (
                    <AppIcons.check className="h-4 w-4 text-[#7B2D3B] stroke-[2.5]" />
                  )}
                </div>
              </button>

              {/* Lista de contas conectadas */}
              {knownAccounts.map((account) => {
                const isSelected = selectedAccountId === account.id
                return (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => {
                      setSelectedAccountId(account.id)
                      setAccountSheetOpen(false)
                    }}
                    className={`w-full min-h-[52px] flex items-center justify-between rounded-xl px-3.5 py-2.5 text-left transition-all touch-manipulation active:scale-[0.99] border ${
                      isSelected
                        ? 'border-[#7B2D3B]/40 bg-[#FDF4F6] text-[#7B2D3B] shadow-xs'
                        : 'border-transparent bg-[#F8FAFA] hover:bg-[#EEF2F2] text-[#353B47]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {account.avatarUrl ? (
                        <img
                          src={account.avatarUrl}
                          alt=""
                          className="h-8 w-8 shrink-0 rounded-lg object-cover border border-[#CBD6D7]"
                        />
                      ) : (
                        <span
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white font-bold text-xs shadow-2xs"
                          style={{ backgroundColor: account.color }}
                        >
                          {account.name.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 truncate">
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: account.color }}
                          />
                          <p className="font-semibold text-sm leading-tight truncate">
                            {account.name}
                          </p>
                        </div>
                        <p className="text-xs text-[#858D97] mt-0.5 leading-tight truncate">
                          {account.phone}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 pl-2">
                      <span className="rounded-full bg-white/80 border border-[#CBD6D7] px-2 py-0.5 text-xs font-semibold tabular-nums text-[#464B5F]">
                        {account.count}
                      </span>
                      {isSelected && (
                        <AppIcons.check className="h-4 w-4 text-[#7B2D3B] stroke-[2.5]" />
                      )}
                    </div>
                  </button>
                )
              })}

              {knownAccounts.length === 0 && (
                <div className="p-6 text-center text-xs text-[#858D97]">
                  <AppIcons.phoneDevice className="mx-auto h-8 w-8 text-[#CBD6D7] mb-2" />
                  <p className="font-semibold text-sm text-[#353B47]">Nenhuma conta conectada</p>
                  <p className="mt-1">
                    Conecte seu WhatsApp em Ajustes para ver seus números aqui.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => {
                      setAccountSheetOpen(false)
                      navigate('/configuracoes')
                    }}
                    className="mt-3 bg-[#464B5F] text-xs hover:bg-[#353B47]"
                  >
                    Ir para Configurações
                  </Button>
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>

        {/* Zona Direita: Busca proporcional + Sino de Follow-ups + Botão de sincronização */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div className="relative w-32 xs:w-40 sm:w-64 lg:w-72">
            <AppIcons.search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-[#99A1A9]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Busca..."
              className="h-8 w-full rounded-lg border border-[#CBD6D7] bg-[#F8FAFA] pl-8 pr-2 text-base md:text-xs text-[#353B47] placeholder:text-[#99A1A9] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#CBD6D7] transition-colors"
            />
          </div>

          {/* Sino com contador de follow-ups pendentes que leva à página /follow-ups */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/follow-ups')}
            className="h-8 min-h-[32px] min-w-[36px] rounded-lg border-[#CBD6D7] text-xs px-2 text-[#464B5F] hover:bg-[#F2F5F5] transition-colors shrink-0 touch-manipulation"
            title="Abrir página de Follow-ups"
            aria-label={`Abrir Follow-ups (${urgentCount} pendentes)`}
          >
            <AppIcons.bell className="h-3.5 w-3.5 text-[#F97316]" />
            <span className="font-bold tabular-nums text-xs ml-1 text-[#EA580C]">
              {urgentCount}
            </span>
          </Button>

          {/* Botão de sincronização manual */}
          <Button
            variant="outline"
            size="sm"
            onClick={triggerSync}
            disabled={syncing}
            className="h-8 min-h-[32px] rounded-lg border-[#CBD6D7] text-xs text-[#5F6D7C] hover:text-[#2C323E] hover:bg-[#F2F5F5] px-2 sm:px-2.5 transition-colors shrink-0 touch-manipulation"
            title={
              activeAccount
                ? `Sincronizar número ${activeAccount.name}`
                : 'Sincronizar conversas com a Zernio'
            }
          >
            <AppIcons.sync className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''} sm:mr-1.5`} />
            <span className="hidden sm:inline">{syncing ? 'Sincronizando...' : 'Sincronizar'}</span>
          </Button>
        </div>
      </header>
    </div>
  )
}
