import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { listConversations, updateConversation } from '@/services/conversations'
import {
  completeFollowUp as completeFollowUpRemote,
  createFollowUp,
  listFollowUps,
} from '@/services/followUps'
import { listMessages } from '@/services/messages'
import type { Conversation, FollowUp, InboxSnapshot, Message } from '@/types/inbox'

interface InboxContextValue extends InboxSnapshot {
  loading: boolean
  usingDemo: boolean
  createFollowUpFor: (conversationId: string, title: string, dueAt: string) => Promise<void>
  completeFollowUp: (id: string) => Promise<void>
  markResponded: (conversationId: string) => Promise<void>
}

const InboxContext = createContext<InboxContextValue | null>(null)

const emptySnapshot: InboxSnapshot = { conversations: [], messages: [], followUps: [] }

function upsert<T extends { id: string }>(items: T[], next: T): T[] {
  const index = items.findIndex((item) => item.id === next.id)
  if (index === -1) return [...items, next]
  const copy = [...items]
  copy[index] = next
  return copy
}

export function InboxProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<InboxSnapshot>(emptySnapshot)
  const [loading, setLoading] = useState(true)
  const usingDemo = false

  useEffect(() => {
    let active = true
    const currentUserId = pb.authStore.record?.id
    const load = async () => {
      setLoading(true)
      try {
        const [conversations, messages, followUps] = await Promise.all([
          listConversations(currentUserId),
          listMessages(currentUserId),
          listFollowUps(currentUserId),
        ])
        if (!active) return
        setSnapshot({ conversations, messages, followUps })
      } catch {
        if (!active) return
        toast.error('Não foi possível carregar as conversas.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()

    return () => {
      active = false
    }
  }, [])

  useRealtime(
    'conversations',
    (event) => {
      const record = event.record as unknown as Conversation & { user?: string }
      const currentUserId = pb.authStore.record?.id
      if (record.user && currentUserId && record.user !== currentUserId) {
        return
      }
      setSnapshot((current) => ({
        ...current,
        conversations:
          event.action === 'delete'
            ? current.conversations.filter((item) => item.id !== record.id)
            : upsert(current.conversations, record),
      }))
    },
    Boolean(pb.authStore.isValid),
  )

  useRealtime(
    'messages',
    (event) => {
      const record = event.record as unknown as Message & { user?: string }
      const currentUserId = pb.authStore.record?.id
      if (record.user && currentUserId && record.user !== currentUserId) {
        return
      }
      setSnapshot((current) => ({
        ...current,
        messages:
          event.action === 'delete'
            ? current.messages.filter((item) => item.id !== record.id)
            : upsert(current.messages, record),
      }))
    },
    Boolean(pb.authStore.isValid),
  )

  useRealtime(
    'follow_ups',
    (event) => {
      const record = event.record as unknown as FollowUp & { user?: string }
      const currentUserId = pb.authStore.record?.id
      if (record.user && currentUserId && record.user !== currentUserId) {
        return
      }
      setSnapshot((current) => ({
        ...current,
        followUps:
          event.action === 'delete'
            ? current.followUps.filter((item) => item.id !== record.id)
            : upsert(current.followUps, record),
      }))
    },
    Boolean(pb.authStore.isValid),
  )

  const createFollowUpFor = useCallback(
    async (conversationId: string, title: string, dueAt: string) => {
      const currentUserId = pb.authStore.record?.id
      const record = await createFollowUp({
        conversation: conversationId,
        title,
        due_at: dueAt,
        done: false,
        user: currentUserId,
      })
      setSnapshot((current) => ({ ...current, followUps: upsert(current.followUps, record) }))
      toast.success('Follow-up criado e adicionado à sua lista.')
    },
    [],
  )

  const completeFollowUp = useCallback(
    async (id: string) => {
      const previous = snapshot.followUps.find((followUp) => followUp.id === id)
      if (!previous) return
      setSnapshot((current) => ({
        ...current,
        followUps: current.followUps.map((item) =>
          item.id === id ? { ...item, done: true } : item,
        ),
      }))
      try {
        await completeFollowUpRemote(id)
        toast.success('Follow-up concluído.')
      } catch (error) {
        setSnapshot((current) => ({ ...current, followUps: upsert(current.followUps, previous) }))
        toast.error('Não foi possível concluir o follow-up.')
        throw error
      }
    },
    [snapshot.followUps],
  )

  const markResponded = useCallback(
    async (conversationId: string) => {
      const previous = snapshot.conversations.find(
        (conversation) => conversation.id === conversationId,
      )
      if (!previous) return
      const now = new Date().toISOString()
      const optimistic: Conversation = {
        ...previous,
        status: 'acompanhamento',
        last_direction: 'out',
        last_message_at: now,
        responded_at: now,
      }
      setSnapshot((current) => ({
        ...current,
        conversations: upsert(current.conversations, optimistic),
      }))

      try {
        const record = await updateConversation(conversationId, {
          status: 'acompanhamento',
          last_direction: 'out',
          last_message_at: now,
          responded_at: now,
        })
        setSnapshot((current) => ({
          ...current,
          conversations: upsert(current.conversations, record),
        }))
        toast.success('Conversa marcada como respondida.', {
          description: 'Ela agora está em acompanhamento.',
        })
      } catch (error) {
        setSnapshot((current) => ({
          ...current,
          conversations: upsert(current.conversations, previous),
        }))
        toast.error('Não foi possível atualizar a conversa.')
        throw error
      }
    },
    [snapshot.conversations],
  )

  const value = useMemo<InboxContextValue>(
    () => ({
      ...snapshot,
      loading,
      usingDemo,
      createFollowUpFor,
      completeFollowUp,
      markResponded,
    }),
    [completeFollowUp, createFollowUpFor, loading, markResponded, snapshot, usingDemo],
  )

  return <InboxContext.Provider value={value}>{children}</InboxContext.Provider>
}

export function useInbox(): InboxContextValue {
  const context = useContext(InboxContext)
  if (!context) throw new Error('useInbox precisa estar dentro de InboxProvider.')
  return context
}
