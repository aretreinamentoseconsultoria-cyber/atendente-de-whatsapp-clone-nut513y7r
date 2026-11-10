import { AppIcons } from '@/lib/icons'
import { formatDeadline, isOverdue, respondedLabel, shortElapsed } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Conversation, FollowUp } from '@/types/inbox'

interface ConversationStatusProps {
  conversation: Conversation
  followUp?: FollowUp
  compact?: boolean
  className?: string
}

export function ConversationStatus({
  conversation,
  followUp,
  compact = false,
  className,
}: ConversationStatusProps) {
  if (followUp && !followUp.done && isOverdue(followUp.due_at)) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-650',
          className,
        )}
      >
        <AppIcons.queueFollowUps className="h-3 w-3 text-red-650" />
        Follow-up vencido
      </span>
    )
  }

  if (followUp && !followUp.done) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full border border-[#CFE6D6] bg-[#F2FAF4] px-2 py-1 text-[11px] font-medium text-[#3F7F55]',
          className,
        )}
      >
        <AppIcons.queueFollowUps className="h-3 w-3 text-[#3F7F55]" />
        {compact
          ? formatDeadline(followUp.due_at)
          : `Follow-up: ${formatDeadline(followUp.due_at)}`}
      </span>
    )
  }

  if (conversation.status === 'sem_resposta' && conversation.last_direction === 'in') {
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-650',
          className,
        )}
      >
        {compact
          ? shortElapsed(conversation.last_message_at)
          : `Sem resposta há ${shortElapsed(conversation.last_message_at)}`}
      </span>
    )
  }

  if (conversation.status === 'madrugada') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full border border-[#F2D9B8] bg-[#FFF7EB] px-2 py-1 text-[11px] font-medium text-[#A2631E]',
          className,
        )}
      >
        <AppIcons.queueNight className="h-3 w-3 text-[#A2631E]" />
        Madrugada
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-[#DDE4E4] bg-[#F5F7F7] px-2 py-1 text-[11px] font-medium text-[#69717E]',
        className,
      )}
    >
      <AppIcons.checkCircle className="h-3 w-3" />
      {compact ? 'Acompanhando' : 'Em acompanhamento'}
      {!compact && conversation.responded_at
        ? ` · ${respondedLabel(conversation.responded_at)}`
        : ''}
    </span>
  )
}
