import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AloLogo } from '@/components/AloLogo'
import { AppIcons } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import { sanitizeDisplayName } from '@/lib/format'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import ReadOnlyBanner from '@/components/ReadOnlyBanner'
import OnboardingWizard from '@/components/OnboardingWizard'
import MobileNav from '@/components/inbox/MobileNav'
import { useAuth } from '@/contexts/AuthContext'
import { CrmProvider, useCrm } from '@/contexts/CrmContext'
import { OnboardingProvider } from '@/contexts/OnboardingContext'

const nav = [
  { to: '/inbox', label: 'Inbox', icon: AppIcons.moduleInbox },
  { to: '/follow-ups', label: 'Follow-ups', icon: AppIcons.moduleFollowUps },
  { to: '/agente', label: 'Agente', icon: AppIcons.moduleAgent },
  { to: '/configuracoes', label: 'Configurações', icon: AppIcons.moduleSettings },
]

function Navigation() {
  const { followUps, zernioSettings, conversations } = useCrm()
  const pending = followUps.filter((item) => !item.done).length
  const isConnected = zernioSettings?.is_connected

  // Conta quantos números distintos temos nas conversas sincronizadas
  const distinctNumbersCount = new Set(
    conversations.map((c) => c.zernio_account_id).filter(Boolean),
  ).size

  const iconColors: Record<string, string> = {
    '/inbox': 'text-[#3B82F6]',
    '/follow-ups': 'text-[#F97316]',
    '/agente': 'text-[#8B5CF6]',
    '/configuracoes': 'text-[#6366F1]',
  }

  return (
    <nav className="space-y-1">
      {nav.map(({ to, label, icon: Icon }) => {
        const iconColor = iconColors[to] || 'text-[#3B82F6]'
        return (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `group flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-all ${
                isActive
                  ? 'bg-white text-[#353B47] ring-1 ring-[#CBD6D7] shadow-xs'
                  : 'text-[#68717E] hover:bg-[#F5F7F7] hover:text-[#464B5F]'
              }`
            }
          >
            <Icon className={`h-4 w-4 ${iconColor}`} /> <span>{label}</span>
            {label === 'Follow-ups' && (
              <span className="ml-auto rounded-full border border-orange-200/70 bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-[#EA580C] tabular-nums">
                {pending}
              </span>
            )}
            {label === 'Configurações' && (
              <span
                className={`ml-auto h-2 w-2 rounded-full ${
                  isConnected ? 'bg-[#10B981]' : 'bg-[#CBD6D7]'
                }`}
                title={
                  isConnected
                    ? distinctNumbersCount > 1
                      ? `Zernio Conectado (${distinctNumbersCount} números ativos)`
                      : 'Zernio Conectado'
                    : 'Zernio Desconectado'
                }
              />
            )}
          </NavLink>
        )
      })}
    </nav>
  )
}

function ShellContent() {
  const { user, logout } = useAuth()
  const { conversations, zernioSettings, activeAccount } = useCrm()
  const location = useLocation()
  const navigate = useNavigate()
  const urgent = conversations.filter(
    (item) =>
      (item.status === 'sem_resposta' && item.last_direction === 'in') ||
      item.status === 'madrugada',
  ).length
  const title =
    location.pathname === '/follow-ups'
      ? 'Follow-ups'
      : location.pathname === '/agente'
        ? 'Agente'
        : location.pathname === '/configuracoes'
          ? 'Configurações'
          : 'Inbox'

  const isInboxRoute =
    location.pathname === '/inbox' ||
    location.pathname === '/' ||
    location.pathname === '/agente' ||
    location.pathname === '/configuracoes'

  const displayName = sanitizeDisplayName(user?.name, user?.email, 'Minha conta')

  const MobileNavDrawer = () => (
    <div className="flex h-full flex-col p-4 bg-[#FBFBFB]">
      <div className="mb-6 flex items-center gap-2.5 px-2 pt-1">
        <AloLogo height={32} />
      </div>
      <Navigation />
      <div className="mt-6 rounded-lg border border-[#CBD6D7] bg-[#F8FBFA] p-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#464B5F]">
          <AppIcons.filterQueue className="h-3.5 w-3.5 text-[#3B82F6]" /> Fila priorizada
        </div>{' '}
        <p className="mt-1.5 text-[11px] leading-4 text-[#7A838D]">
          Urgência, intenção e tempo sem resposta organizados para você.
        </p>
      </div>
      <div className="mt-auto flex items-center gap-2 border-t border-[#DDE5E5] pt-4">
        <div className="grid h-8 w-8 place-items-center rounded-full bg-violet-100 text-xs font-bold text-violet-700 ring-1 ring-violet-200">
          {displayName.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">{displayName}</p>
          <p className="truncate text-[10px] text-[#858D97]">{user?.email}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            logout()
            navigate('/')
          }}
          aria-label="Sair"
        >
          <AppIcons.logout className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )

  // Em rotas que NÃO são a inbox (como /follow-ups e /configuracoes), fornecemos um rail fino ou cabeçalho rápido
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#F4F7F7] text-[#464B5F]">
      <ReadOnlyBanner />
      <OnboardingWizard />
      <div className="relative flex-1 flex min-h-0 overflow-hidden">
        {/* Rail fino persistente fora da inbox/configuracoes (60px) para páginas simples como /follow-ups */}
        {!isInboxRoute && (
          <aside className="hidden md:flex w-[60px] shrink-0 flex-col items-center border-r border-[#CBD6D7] bg-[#F8FAFA] py-3 z-20">
            {/* Logo Alô (ícone balão refinado) */}
            <NavLink
              to="/inbox"
              title="Alô — Voltar para a Inbox"
              className="flex h-10 w-10 items-center justify-center rounded-xl transition-transform hover:scale-105"
            >
              <AloLogo iconOnly height={34} />
            </NavLink>

            {/* Ícones de navegação rápida (estilo PostHog: coloridos, traço marcante Phosphor) */}
            <div className="mt-6 flex flex-col items-center gap-2">
              <NavLink
                to="/inbox"
                title="Inbox"
                className={({ isActive }) =>
                  `flex h-10 w-10 items-center justify-center rounded-xl transition-all ${
                    isActive
                      ? 'bg-white text-[#1D4ED8] ring-1 ring-[#CBD6D7] shadow-xs'
                      : 'text-[#606A78] hover:bg-white hover:ring-1 hover:ring-[#CBD6D7]/60'
                  }`
                }
              >
                <AppIcons.moduleInbox className="h-4 w-4 text-[#3B82F6]" />
              </NavLink>

              <NavLink
                to="/follow-ups"
                title="Follow-ups"
                className={({ isActive }) =>
                  `relative flex h-10 w-10 items-center justify-center rounded-xl transition-all ${
                    isActive
                      ? 'bg-white text-[#EA580C] ring-1 ring-[#CBD6D7] shadow-xs'
                      : 'text-[#606A78] hover:bg-white hover:ring-1 hover:ring-[#CBD6D7]/60'
                  }`
                }
              >
                <AppIcons.moduleFollowUps className="h-4 w-4 text-[#F97316]" />
                {urgent > 0 && (
                  <span className="absolute top-1.5 right-1.5 flex h-2 w-2 rounded-full bg-[#EA580C] ring-2 ring-white" />
                )}
              </NavLink>

              <NavLink
                to="/agente"
                title="Agente IA"
                className={({ isActive }) =>
                  `flex h-10 w-10 items-center justify-center rounded-xl transition-all ${
                    isActive
                      ? 'bg-white text-[#7C3AED] ring-1 ring-[#CBD6D7] shadow-xs'
                      : 'text-[#606A78] hover:bg-white hover:ring-1 hover:ring-[#CBD6D7]/60'
                  }`
                }
              >
                <AppIcons.moduleAgent className="h-4 w-4 text-[#8B5CF6]" />
              </NavLink>

              <NavLink
                to="/configuracoes"
                title="Configurações"
                className={({ isActive }) =>
                  `flex h-10 w-10 items-center justify-center rounded-xl transition-all ${
                    isActive
                      ? 'bg-white text-[#4F46E5] ring-1 ring-[#CBD6D7] shadow-xs'
                      : 'text-[#606A78] hover:bg-white hover:ring-1 hover:ring-[#CBD6D7]/60'
                  }`
                }
              >
                <AppIcons.moduleSettings className="h-4 w-4 text-[#6366F1]" />
              </NavLink>
            </div>

            {/* Perfil na base */}
            <div className="mt-auto flex flex-col items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  logout()
                  navigate('/')
                }}
                className="h-9 w-9 rounded-xl text-[#7A838E] hover:bg-red-50 hover:text-red-600"
                title="Sair"
                aria-label="Sair"
              >
                <AppIcons.logout className="h-4 w-4 text-[#EF4444]" />
              </Button>
              <div
                className="grid h-8 w-8 place-items-center rounded-full bg-violet-100 text-xs font-bold text-violet-700 ring-1 ring-violet-200"
                title={user?.email || displayName}
              >
                {displayName.slice(0, 1).toUpperCase()}
              </div>
            </div>
          </aside>
        )}

        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          {/* Header secundário apenas para páginas simples (ex: Follow-ups). Inbox e Configurações gerenciam seu próprio shell completo de 3 colunas */}
          {!isInboxRoute && (
            <header className="shrink-0 z-20 flex h-11 items-center justify-between border-b border-[#CBD6D7] bg-white px-4">
              <div className="flex items-center gap-3">
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" className="md:hidden h-8 w-8">
                      <AppIcons.menu className="h-4 w-4" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-[260px] border-[#CBD6D7] p-0">
                    <MobileNavDrawer />
                  </SheetContent>
                </Sheet>
                <div>
                  <h1 className="text-xs font-bold text-[#353B47] uppercase tracking-wide">
                    {title}
                  </h1>
                </div>
              </div>
            </header>
          )}

          <main className="flex-1 min-h-0 overflow-hidden">
            <Outlet />
          </main>

          {/* Barra de navegação inferior MobileNav ativa em todas as rotas para telas móveis (< md) */}
          <MobileNav />
        </div>
      </div>
    </div>
  )
}

export default function AppShell() {
  return (
    <CrmProvider>
      <OnboardingProvider>
        <ShellContent />
      </OnboardingProvider>
    </CrmProvider>
  )
}
