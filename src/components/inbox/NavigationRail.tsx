import { AloLogo } from '@/components/AloLogo'
import { AppIcons } from '@/lib/icons'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { sanitizeDisplayName } from '@/lib/format'

interface NavigationRailProps {
  activeView: 'inbox' | 'settings'
  onViewChange: (view: 'inbox' | 'settings') => void
  onMobileMenu: () => void
}

export function NavigationRail({ activeView, onViewChange, onMobileMenu }: NavigationRailProps) {
  const { user, logout } = useAuth()
  const displayName = sanitizeDisplayName(user?.name, user?.email, 'Atendente')
  const initials =
    displayName
      .split(/[\s@]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'A'

  const railButton = (
    label: string,
    icon: React.ReactNode,
    active: boolean,
    onClick: () => void,
  ) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-xl transition-all',
            active
              ? 'bg-white ring-1 ring-[#CBD6D7] shadow-xs'
              : 'text-[#606A78] hover:bg-white hover:ring-1 hover:ring-[#CBD6D7]/60',
          )}
          aria-label={label}
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )

  return (
    <aside className="flex h-full w-[64px] shrink-0 flex-col items-center border-r border-[#CBD6D7] bg-[#FBFBFB] py-3 max-md:w-[56px]">
      <button
        type="button"
        onClick={onMobileMenu}
        className="mb-4 hidden h-10 w-10 items-center justify-center rounded-xl text-[#707786] hover:bg-[#EEF2F2] max-lg:flex"
        aria-label="Abrir menu"
      >
        <AppIcons.menu className="h-[18px] w-[18px]" />
      </button>
      <div className="mb-4 flex items-center justify-center max-lg:hidden">
        <AloLogo iconOnly height={34} />
      </div>

      <nav className="flex flex-col items-center gap-2">
        {railButton(
          'Inbox',
          <AppIcons.moduleInbox className="h-[18px] w-[18px] text-[#3B82F6]" />,
          activeView === 'inbox',
          () => onViewChange('inbox'),
        )}
        {railButton(
          'Notificações',
          <AppIcons.bell className="h-[18px] w-[18px] text-[#F97316]" />,
          false,
          () => onViewChange('inbox'),
        )}
        {railButton(
          'Configurações',
          <AppIcons.moduleSettings className="h-[18px] w-[18px] text-[#8B5CF6]" />,
          activeView === 'settings',
          () => onViewChange('settings'),
        )}
      </nav>

      <div className="mt-auto flex flex-col items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-xl text-[#9096A1] hover:text-[#464B5F]"
          aria-label="Ajuda"
        >
          <AppIcons.help className="h-[18px] w-[18px]" />
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={logout}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-[#9096A1] hover:bg-red-50 hover:text-red-600"
              aria-label="Sair"
            >
              <AppIcons.logout className="h-[17px] w-[17px]" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Sair</TooltipContent>
        </Tooltip>
        <Avatar className="mt-1 h-9 w-9 border border-violet-200">
          <AvatarFallback className="bg-violet-100 text-[11px] font-semibold text-violet-700">
            {initials}
          </AvatarFallback>
        </Avatar>
      </div>
    </aside>
  )
}
