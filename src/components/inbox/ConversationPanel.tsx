import { useCallback, useEffect, useRef } from 'react'
import { AppIcons } from '@/lib/icons'

import Composer from '@/components/inbox/Composer'
import { LeadIntelligence } from '@/components/inbox/LeadIntelligence'
import MessageThread from '@/components/inbox/MessageThread'
import { dueLabel, isOverdue, openFollowUpFor } from '@/components/inbox/format'
import type { Conversation, FollowUp, Message } from '@/types/inbox'

type ConversationPanelProps = {
  conversation?: Conversation
  messages: Message[]
  followUps: FollowUp[]
  draft: string
  generating: boolean
  onBack: () => void
  onDraftChange: (value: string) => void
  onSuggest: () => void
  onCopy: () => void
  onMarkResponded: () => void
  onCreateFollowUp: () => void
}

export default function ConversationPanel({
  conversation,
  messages,
  followUps,
  draft,
  generating,
  onBack,
  onDraftChange,
  onSuggest,
  onCopy,
  onMarkResponded,
  onCreateFollowUp,
}: ConversationPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevIdRef = useRef<string | null>(null)
  const prevCountRef = useRef<number>(0)
  const isNearBottomRef = useRef<boolean>(true)

  const scrollToBottom = useCallback((instant = true) => {
    const el = scrollRef.current
    if (!el) return
    if (instant) {
      el.scrollTop = el.scrollHeight
    } else {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }
  }, [])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    isNearBottomRef.current = distanceToBottom < 100
  }, [])

  useEffect(() => {
    if (!conversation) return
    const isNew = prevIdRef.current !== conversation.id
    if (isNew) {
      prevIdRef.current = conversation.id
      prevCountRef.current = messages.length
      isNearBottomRef.current = true
      scrollToBottom(true)
      const frameId = requestAnimationFrame(() => {
        scrollToBottom(true)
        requestAnimationFrame(() => {
          scrollToBottom(true)
        })
      })
      return () => cancelAnimationFrame(frameId)
    }

    const prevCount = prevCountRef.current
    const currentCount = messages.length
    prevCountRef.current = currentCount
    if (currentCount > prevCount && isNearBottomRef.current) {
      scrollToBottom(true)
      const frameId = requestAnimationFrame(() => {
        scrollToBottom(true)
      })
      return () => cancelAnimationFrame(frameId)
    }
  }, [conversation, messages.length, scrollToBottom])

  if (!conversation) {
    return (
      <section className="conversation-panel empty-conversation">
        <div className="empty-conversation-icon">👁️</div>
        <h2>Escolha uma conversa</h2>
        <p>Leia o contexto, priorize a resposta e gere um rascunho seguro.</p>
      </section>
    )
  }

  const followUp = openFollowUpFor(conversation.id, followUps)

  return (
    <section className="conversation-panel animate-fade-in" key={conversation.id}>
      <header className="conversation-header">
        <div className="conversation-heading">
          <button className="mobile-back" type="button" onClick={onBack}>
            <AppIcons.arrowLeft size={17} /> Voltar
          </button>
          <p className="eyebrow">CONVERSA</p>
          <div className="flex items-center gap-2">
            {conversation.avatar_url && (
              <img
                src={conversation.avatar_url}
                alt={conversation.name}
                className="h-8 w-8 rounded-full border border-[#CBD6D7] object-cover"
                referrerPolicy="no-referrer"
              />
            )}
            <h1>Oi 👋 — {conversation.name}</h1>
          </div>
          <span>{conversation.phone}</span>
        </div>
        <div className="conversation-header-actions">
          <button type="button">
            <AppIcons.queueTracking size={14} /> <span>Snooze</span>
          </button>
          <button type="button" onClick={onMarkResponded}>
            <AppIcons.checkCircle size={14} /> <span>Marcar como respondida</span>
          </button>
          <button type="button" aria-label="Mais ações">
            <AppIcons.dotsHorizontal size={18} />
          </button>
          <button className="followup-header-button" type="button" onClick={onCreateFollowUp}>
            <AppIcons.queueFollowUps size={15} /> Criar follow-up
          </button>
        </div>
      </header>

      {followUp && (
        <div className={`followup-banner ${isOverdue(followUp) ? 'overdue' : ''}`}>
          <AppIcons.queueFollowUps size={14} />
          <strong>{followUp.title}</strong>
          <span>{isOverdue(followUp) ? 'Vencido' : `Prazo: ${dueLabel(followUp.due_at)}`}</span>
        </div>
      )}

      <div className="conversation-scroll" ref={scrollRef} onScroll={handleScroll}>
        <LeadIntelligence conversation={conversation} />
        <MessageThread conversation={conversation} messages={messages} />
      </div>

      <Composer
        conversationId={conversation.id}
        draft={draft}
        generating={generating}
        onDraftChange={onDraftChange}
        onSuggest={onSuggest}
        onCopy={onCopy}
        onMarkResponded={onMarkResponded}
      />
    </section>
  )
}
