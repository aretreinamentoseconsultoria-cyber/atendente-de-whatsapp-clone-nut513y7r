import pb from '@/lib/pocketbase/client'
import {
  displayableMessages,
  streamAgentChat,
  type AgentMessage,
  type DisplayMessage,
} from '@/lib/skipAi'

export interface AgentConversationItem {
  id: string
  title?: string
  created: string
  updated: string
  user_id?: string
}

export type ActionStatus = 'pending_approval' | 'pending' | 'completed' | 'failed' | 'rejected'
export type ActionType = 'create_zernio_template' | 'send_zernio_message'

export interface AgentActionRecord {
  id: string
  user: string
  action_type: ActionType
  status: ActionStatus
  params: Record<string, unknown> | null
  result: Record<string, unknown> | null
  error_message?: string
  created: string
  updated: string
}

export interface ToolCallUIState {
  id: string
  name: string
  status: 'running' | 'completed' | 'failed'
  label: string
  startTime: number
  endTime?: number
  actionRecord?: AgentActionRecord
}

/**
 * Envia uma mensagem ao Agente nativo Skip Cloud via SSE streaming
 */
export async function sendAgentMessageStream(
  message: string,
  conversationId: string | null,
  handlers: {
    onChunk?: (delta: string, accumulated: string) => void
    onToolCallStart?: (toolCall: { id: string; name: string }) => void
    onToolCallDone?: (toolCall: { id: string; ok: boolean }) => void
    signal?: AbortSignal
  },
): Promise<{
  conversationId: string
  content: string
  messageId?: string
  toolCalls: Array<{ id: string; name: string; ok: boolean }>
}> {
  const token = pb.authStore.token
  const baseUrl = import.meta.env.VITE_POCKETBASE_URL || ''

  const res = await fetch(`${baseUrl}/backend/v1/agent/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      message,
      conversation_id: conversationId,
      stream: true,
      token: token || undefined,
      user_id: pb.authStore.model?.id || undefined,
    }),
    signal: handlers.signal,
  })
  const result = await streamAgentChat(res, {
    onChunk: handlers.onChunk,
    onToolCallStart: handlers.onToolCallStart,
    onToolCallDone: handlers.onToolCallDone,
    signal: handlers.signal,
  })

  const returnedConvId =
    res.headers.get('X-Conversation-Id') || result.conversation_id || conversationId || ''

  return {
    conversationId: returnedConvId,
    content: result.content,
    messageId: result.message_id,
    toolCalls: result.toolCalls,
  }
}

/**
 * Lista as conversas prévias do usuário com o Agente
 */
export async function listAgentConversations(limit = 20): Promise<AgentConversationItem[]> {
  try {
    const res = await pb.send<
      AgentConversationItem[] | { conversations?: AgentConversationItem[] }
    >(`/backend/v1/agent/conversations?limit=${limit}`, {
      method: 'GET',
    })
    if (Array.isArray(res)) return res
    if (res && Array.isArray(res.conversations)) return res.conversations
    return []
  } catch (err) {
    console.warn('Erro ao carregar conversas do agente:', err)
    return []
  }
}

/**
 * Carrega o histórico de mensagens de uma conversa com o Agente e passa por displayableMessages
 */
export async function loadAgentMessages(conversationId: string): Promise<DisplayMessage[]> {
  try {
    const res = await pb.send<{ messages: AgentMessage[] } | AgentMessage[]>(
      `/backend/v1/agent/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        method: 'GET',
      },
    )

    const rawList: AgentMessage[] = Array.isArray(res) ? res : res?.messages || []
    return displayableMessages(rawList)
  } catch (err) {
    console.warn('Erro ao carregar mensagens da conversa do agente:', err)
    return []
  }
}

/**
 * Busca ações do usuário na coleção agent_actions (multi-tenancy)
 */
export async function listUserAgentActions(limit = 30): Promise<AgentActionRecord[]> {
  try {
    const records = await pb.collection('agent_actions').getList(1, limit, {
      sort: '-created',
      requestKey: null,
    })
    return records.items.map((r) => ({
      id: r.id,
      user: r.getString('user'),
      action_type: r.getString('action_type') as ActionType,
      status: r.getString('status') as ActionStatus,
      params: (r.get('params') as Record<string, unknown>) || null,
      result: (r.get('result') as Record<string, unknown>) || null,
      error_message: r.getString('error_message'),
      created: r.getString('created'),
      updated: r.getString('updated'),
    }))
  } catch (err) {
    console.warn('Erro ao buscar agent_actions:', err)
    return []
  }
}

/**
 * Aprova uma ação pendente de aprovação via rota autenticada multi-tenant
 */
export async function approveAgentAction(actionId: string): Promise<{
  success: boolean
  status: ActionStatus
  error_message?: string
  record?: AgentActionRecord
}> {
  const token = pb.authStore.token
  const baseUrl = import.meta.env.VITE_POCKETBASE_URL || ''

  const res = await fetch(
    `${baseUrl}/backend/v1/agent-actions/${encodeURIComponent(actionId)}/approve`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    },
  )

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.error || data?.message || 'Falha ao aprovar ação')
  }

  return data
}

/**
 * Recusa uma ação pendente de aprovação via rota autenticada multi-tenant
 */
export async function rejectAgentAction(
  actionId: string,
  reason?: string,
): Promise<{
  success: boolean
  status: ActionStatus
  message?: string
}> {
  const token = pb.authStore.token
  const baseUrl = import.meta.env.VITE_POCKETBASE_URL || ''

  const res = await fetch(
    `${baseUrl}/backend/v1/agent-actions/${encodeURIComponent(actionId)}/reject`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ reason: reason || 'Recusado pelo usuário no chat.' }),
    },
  )

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.error || data?.message || 'Falha ao recusar ação')
  }

  return data
}
