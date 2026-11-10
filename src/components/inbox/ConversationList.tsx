import { AppIcons } from '@/lib/icons'
import { useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useInbox } from '@/contexts/InboxContext'
import { formatListTime } from '@/lib/format'
import { AnimatedListItem } from '@/components/reactbits/AnimatedListItem'
import { cn } from '@/lib/utils'
import { parseSharedContact } from '@/lib/contactCard'
import { ConversationStatus } from './ConversationStatus'
import { ConversationLoadingState } from './ConversationLoadingState'

interface ConversationListProps {
  selectedId: string | null
  queueFilter: 'all' | 'reply' | 'night' | 'tracking'
  onSelect: (id: string) => void
  onBack?: () => void
}

const initials = (name: string) =>
  name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

export function ConversationList({ selectedId, queueFilter, onSelect }: ConversationListProps) {
  const { conversations, messages, followUps, loading } = useInbox()
  const [query, setQuery] = useState('')

  const filtered = useMemo(
    () =>
      conversations
        .filter((conversation) => {
          if (queueFilter === 'reply')
            return conversation.status === 'sem_resposta' && conversation.last_direction === 'in'
          if (queueFilter === 'night') return conversation.status === 'madrugada'
          if (queueFilter === 'tracking')
            return conversation.status === 'acompanhamento' || conversation.status === 'respondida'
          return true
        })
        .filter(
          (conversation) =>
            conversation.name.toLowerCase().includes(query.toLowerCase()) ||
            conversation.phone.includes(query),
        )
        .sort(
          (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime(),
        ),
    [conversations, query, queueFilter],
  )

  const lastMessage = (conversationId: string) =>
    messages
      .filter((message) => message.conversation === conversationId)
      .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())[0]

  const title =
    queueFilter === 'reply'
      ? 'Responder agora'
      : queueFilter === 'night'
        ? 'Conversas da madrugada'
        : queueFilter === 'tracking'
          ? 'Em acompanhamento'
          : 'Todas as conversas'

  return (
    <section className="flex h-full w-[340px] shrink-0 flex-col border-r border-[#CBD6D7] bg-white max-xl:w-[310px] max-md:w-full">
      <header className="border-b border-[#DCE4E4] px-4 py-3.5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-[#464B5F]">{title}</h2>
            <p className="mt-0.5 text-[11px] text-[#A3A5AF]">
              {filtered.length} {filtered.length === 1 ? 'conversa' : 'conversas'}
            </p>
          </div>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#9BA0AA] hover:bg-[#F2F5F5] hover:text-[#606878]"
            aria-label="Filtrar conversas"
          >
            <AppIcons.filterQueue className="h-4 w-4" />
          </button>
        </div>
        <div className="relative mt-3">
          <AppIcons.search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-[#ADB1B9]" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nome ou telefone"
            className="h-9 border-[#DCE4E4] bg-[#F8FAFA] pl-8 text-xs focus-visible:ring-[#57D067]"
          />
        </div>
      </header>

      <ScrollArea className="flex-1">
        <div>
          {loading && !conversations.length && (
            <div className="p-2">
              <ConversationLoadingState className="py-8" />
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center px-8 py-16 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F1F4F4] text-[#9BA1AA]">
                <AppIcons.search className="h-4 w-4" />
              </span>
              <p className="mt-3 text-sm font-medium text-[#656D7B]">Nenhuma conversa aqui</p>
              <p className="mt-1 text-xs leading-5 text-[#A0A5AE]">
                Tente outro filtro ou termo de busca.
              </p>
            </div>
          )}
          {filtered.map((conversation) => {
            const message = lastMessage(conversation.id)
            const followUp = followUps.find(
              (item) => item.conversation === conversation.id && !item.done,
            )
            return (
              <AnimatedListItem key={conversation.id} id={conversation.id} layoutDuration={0.3}>
                <button
                  type="button"
                  onClick={() => onSelect(conversation.id)}
                  className={cn(
                    'relative w-full border-b border-[#E5EBEB] px-4 py-3.5 text-left transition-colors',
                    selectedId === conversation.id ? 'bg-[#EFF8FA]' : 'bg-white hover:bg-[#F8FAFA]',
                  )}
                >
                  {selectedId === conversation.id && (
                    <span className="absolute inset-y-0 left-0 w-[3px] bg-[#64C99D]" />
                  )}
                  <div className="flex items-start gap-3">
                    {conversation.avatar_url ? (
                      <img
                        src={conversation.avatar_url}
                        alt={conversation.name}
                        className="h-9 w-9 shrink-0 rounded-full border border-[#CBD6D7] object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EDF1F1] text-[11px] font-semibold text-[#66707D]">
                        {initials(conversation.name)}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <strong className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[#464B5F]">
                          {conversation.name}
                        </strong>
                        <span className="shrink-0 text-[10px] text-[#A3A5AF]">
                          {formatListTime(conversation.last_message_at)}
                        </span>
                      </div>
                      {(() => {
                        const rawSummary = message?.body ?? conversation.summary
                        const sharedContact = parseSharedContact(rawSummary)
                        if (sharedContact) {
                          return (
                            <div className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-[#EDF7F2] px-1.5 py-0.5 text-[10px] font-medium text-[#2F6B4F] border border-[#BFDFCF]">
                              <AppIcons.contactCard className="h-3 w-3 shrink-0 text-[#2C8A55]" />
                              <span className="truncate">Contato: {sharedContact.name}</span>
                            </div>
                          )
                        }
                        return (
                          <p className="mt-1 truncate text-[11px] leading-4 text-[#888E99]">
                            {rawSummary}
                          </p>
                        )
                      })()}
                      <div className="mt-2 flex items-center gap-1.5">
                        <ConversationStatus
                          conversation={conversation}
                          followUp={followUp}
                          compact
                        />
                        {conversation.temperature === 'quente' && (
                          <span className="rounded-full bg-[#FFF5E6] px-2 py-1 text-[10px] font-medium text-[#A96A22]">
                            Lead quente
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              </AnimatedListItem>
            )
          })}
        </div>
      </ScrollArea>
    </section>
  )
}
