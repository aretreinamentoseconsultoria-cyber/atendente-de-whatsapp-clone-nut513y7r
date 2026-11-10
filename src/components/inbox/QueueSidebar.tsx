import { useMemo } from 'react'
import { AppIcons } from '@/lib/icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useInbox } from '@/contexts/InboxContext'
import { formatDeadline, isOverdue } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Conversation } from '@/types/inbox'

interface QueueSidebarProps {
  selectedId: string | null
  queueFilter: 'all' | 'reply' | 'night' | 'tracking'
  onFilterChange: (filter: 'all' | 'reply' | 'night' | 'tracking') => void
  onSelectConversation: (id: string) => void
}

export function QueueSidebar({
  selectedId,
  queueFilter,
  onFilterChange,
  onSelectConversation,
}: QueueSidebarProps) {
  const { conversations, followUps, completeFollowUp } = useInbox()
  const replyCount = conversations.filter(
    (conversation) =>
      conversation.last_direction === 'in' && conversation.status === 'sem_resposta',
  ).length
  const nightCount = conversations.filter(
    (conversation) => conversation.status === 'madrugada',
  ).length
  const trackingCount = conversations.filter(
    (conversation) =>
      conversation.status === 'acompanhamento' || conversation.status === 'respondida',
  ).length

  const activeFollowUps = useMemo(
    () =>
      followUps
        .filter((followUp) => !followUp.done)
        .sort((a, b) => {
          const aOverdue = isOverdue(a.due_at) ? 0 : 1
          const bOverdue = isOverdue(b.due_at) ? 0 : 1
          return aOverdue - bOverdue || new Date(a.due_at).getTime() - new Date(b.due_at).getTime()
        }),
    [followUps],
  )

  const conversationMap = useMemo(
    () => new Map(conversations.map((item) => [item.id, item])),
    [conversations],
  )

  const menuItems: Array<{
    id: typeof queueFilter
    label: string
    icon: React.ReactNode
    count?: number
  }> = [
    {
      id: 'all',
      label: 'Todas as conversas',
      icon: <AppIcons.queueAll className="h-4 w-4 text-[#3B82F6]" />,
      count: conversations.length,
    },
    {
      id: 'reply',
      label: 'Responder agora',
      icon: <AppIcons.queueUrgent className="h-4 w-4 text-[#EF4444]" />,
      count: replyCount,
    },
    {
      id: 'night',
      label: 'Madrugada',
      icon: <AppIcons.queueNight className="h-4 w-4 text-[#8B5CF6]" />,
      count: nightCount,
    },
    {
      id: 'tracking',
      label: 'Em acompanhamento',
      icon: <AppIcons.queueTracking className="h-4 w-4 text-[#10B981]" />,
      count: trackingCount,
    },
  ]

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-[#CBD6D7] bg-[#FBFBFB] max-lg:w-[280px]">
      <div className="border-b border-[#DCE4E4] px-4 py-[18px]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#A3A5AF]">
              Atendente
            </p>
            <h1 className="mt-0.5 text-base font-semibold tracking-tight text-[#464B5F]">
              Inbox WhatsApp
            </h1>
          </div>
          <span
            className="h-2 w-2 rounded-full bg-[#57D067] ring-4 ring-[#E8F8ED]"
            title="Sincronizado"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <nav className="space-y-1 p-3">
          {menuItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onFilterChange(item.id)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors',
                queueFilter === item.id
                  ? 'bg-[#EDF2F2] text-[#3E4658]'
                  : 'text-[#717886] hover:bg-[#F1F4F4] hover:text-[#464B5F]',
              )}
            >
              <span className={queueFilter === item.id ? 'text-[#50596A]' : 'text-[#9BA0A9]'}>
                {item.icon}
              </span>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {typeof item.count === 'number' && (
                <Badge
                  variant="secondary"
                  className={cn(
                    'h-5 min-w-5 justify-center rounded-full border-0 px-1.5 text-[10px] font-semibold',
                    item.id === 'reply' && item.count > 0
                      ? 'bg-red-50 text-red-600'
                      : 'bg-[#E4E9E9] text-[#717987]',
                  )}
                >
                  {item.count}
                </Badge>
              )}
            </button>
          ))}
        </nav>

        <div className="mx-4 border-t border-[#DFE6E6]" />

        <section className="px-3 pb-5 pt-4">
          <div className="mb-2 flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
              <AppIcons.queueFollowUps className="h-3.5 w-3.5 text-[#F97316]" />
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[#858B97]">
                Follow-ups
              </h2>
            </div>
            <Badge className="h-5 min-w-5 rounded-full border-0 bg-[#464B5F] px-1.5 text-[10px] text-white hover:bg-[#464B5F]">
              {activeFollowUps.length}
            </Badge>
          </div>

          <div className="space-y-1.5">
            {activeFollowUps.length === 0 && (
              <p className="rounded-lg border border-dashed border-[#D6DFDF] px-3 py-4 text-center text-xs leading-5 text-[#9AA0A9]">
                Nenhum follow-up pendente.
              </p>
            )}
            {activeFollowUps.map((followUp) => {
              const conversation = conversationMap.get(followUp.conversation)
              if (!conversation) return null
              const overdue = isOverdue(followUp.due_at)
              return (
                <div
                  key={followUp.id}
                  className={cn(
                    'group rounded-lg border p-2.5 transition-colors',
                    selectedId === conversation.id
                      ? 'border-[#B9C9CA] bg-white'
                      : 'border-transparent hover:border-[#DCE4E4] hover:bg-white',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelectConversation(conversation.id)}
                    className="w-full text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'h-1.5 w-1.5 shrink-0 rounded-full',
                          overdue ? 'bg-red-500' : 'bg-[#55B776]',
                        )}
                      />
                      <strong className="min-w-0 flex-1 truncate text-xs font-semibold text-[#4A5262]">
                        {conversation.name}
                      </strong>
                      <AppIcons.arrowRight className="h-3 w-3 text-[#B1B5BC]" />
                    </div>
                    <p className="mt-1.5 truncate pl-3.5 text-[11px] text-[#777E8B]">
                      {followUp.title}
                    </p>
                    <div className="mt-1.5 flex items-center justify-between pl-3.5">
                      <span
                        className={cn(
                          'text-[10px] font-medium',
                          overdue ? 'text-red-600' : 'text-[#4D8560]',
                        )}
                      >
                        {overdue ? 'Follow-up vencido' : formatDeadline(followUp.due_at)}
                      </span>
                    </div>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void completeFollowUp(followUp.id)}
                    className="mt-1.5 h-7 w-full justify-start pl-3 text-[10px] font-semibold text-[#78808C] opacity-100 hover:bg-[#EFF5F1] hover:text-[#417754] lg:opacity-0 lg:group-hover:opacity-100"
                  >
                    <AppIcons.check className="mr-1.5 h-3 w-3" />
                    Concluído
                  </Button>
                </div>
              )
            })}
          </div>
        </section>
      </ScrollArea>
    </aside>
  )
}
