import type { Conversation, FollowUp, Message } from '@/types/inbox'

export function hoursSince(value: string) {
  return Math.max(0, (Date.now() - new Date(value).getTime()) / 3_600_000)
}

export function timeAgo(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000))
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

export function dateTimeLabel(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function dueLabel(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function isNightMessage(message?: Message) {
  if (!message || message.direction !== 'in') return false
  const hour = new Date(message.sent_at).getHours()
  return hour >= 0 && hour < 6
}

export function openFollowUpFor(conversationId: string, followUps: FollowUp[]) {
  return followUps.find((item) => item.conversation === conversationId && !item.done)
}

export function isOverdue(followUp?: FollowUp) {
  return Boolean(followUp && !followUp.done && new Date(followUp.due_at).getTime() < Date.now())
}

export function priorityRank(
  conversation: Conversation,
  lastMessage: Message | undefined,
  followUp: FollowUp | undefined,
) {
  if (
    conversation.status === 'sem_resposta' &&
    conversation.last_direction === 'in' &&
    hoursSince(conversation.last_message_at) >= 24
  )
    return 0
  if (conversation.status === 'madrugada' || isNightMessage(lastMessage)) return 1
  if (isOverdue(followUp)) return 2
  if (conversation.status === 'followup') return 3
  if (conversation.status === 'respondida') return 5
  return 4
}
