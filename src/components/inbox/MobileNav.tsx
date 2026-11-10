import { useLocation, useNavigate } from 'react-router-dom'
import { AppIcons } from '@/lib/icons'
import { useCrm } from '@/contexts/CrmContext'

export default function MobileNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const { followUps } = useCrm()
  const pendingFollowUps = followUps.filter((item) => !item.done).length

  const items = [
    {
      to: '/inbox',
      label: 'Inbox',
      icon: AppIcons.moduleInbox,
      activeColor: 'text-[#3B82F6]',
    },
    {
      to: '/follow-ups',
      label: 'Follow-ups',
      icon: AppIcons.moduleFollowUps,
      activeColor: 'text-[#F97316]',
      badge: pendingFollowUps > 0 ? pendingFollowUps : null,
    },
    {
      to: '/agente',
      label: 'Agente',
      icon: AppIcons.moduleAgent,
      activeColor: 'text-[#8B5CF6]',
    },
    {
      to: '/configuracoes',
      label: 'Ajustes',
      icon: AppIcons.moduleSettings,
      activeColor: 'text-[#6366F1]',
    },
  ]

  const currentPath = location.pathname

  return (
    <nav
      className="md:hidden shrink-0 z-40 flex items-center justify-around border-t border-[#CBD6D7] bg-white/95 backdrop-blur-md px-2 pt-1 pb-[max(0.375rem,env(safe-area-inset-bottom))] shadow-[0_-2px_10px_rgba(0,0,0,0.04)]"
      aria-label="Navegação móvel"
    >
      {items.map((item) => {
        const Icon = item.icon
        const isActive =
          item.to === '/inbox'
            ? currentPath === '/inbox' || currentPath === '/'
            : currentPath.startsWith(item.to)

        return (
          <button
            key={item.to}
            type="button"
            onClick={() => {
              navigate(item.to)
              // Emissão de evento customizado para que páginas como /inbox possam resetar a visão para a lista se já estiverem nela
              window.dispatchEvent(
                new CustomEvent('mobilenav:navigate', { detail: { to: item.to } }),
              )
            }}
            className={`relative flex min-h-[44px] min-w-[48px] flex-col items-center justify-center gap-0.5 py-1 px-3 rounded-xl transition-all touch-manipulation active:scale-95 ${
              isActive ? `${item.activeColor} font-bold` : 'text-[#7A838E] hover:text-[#464B5F]'
            }`}
            aria-current={isActive ? 'page' : undefined}
          >
            <div className="relative">
              <Icon className="h-5 w-5" />
              {item.badge !== null && item.badge !== undefined && (
                <span className="absolute -top-1 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#EA580C] px-1 text-[9px] font-bold text-white tabular-nums ring-1 ring-white">
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </div>
            <span className="text-[10px] tracking-tight">{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
export { MobileNav }
