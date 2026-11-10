import pb from '@/lib/pocketbase/client'
import type { Conversation, FollowUp, Message } from '@/types/crm'

/**
 * Busca todas as conversas do usuário autenticado no PocketBase.
 * Utiliza paginação em lote resiliente (batch 200) para garantir que
 * mesmo que haja centenas ou milhares de conversas, todas sejam carregadas
 * sem cortes por limites padrão de página da API.
 */
export async function listConversations(userId?: string): Promise<Conversation[]> {
  const currentUserId = userId || pb.authStore.record?.id
  const filter = currentUserId ? `user = "${currentUserId}"` : undefined

  try {
    // Tenta carregar em páginas/lotes contínuos com getList para não depender de teto fixo
    const pageSize = 200
    let page = 1
    let totalPages = 1
    const allItems: Conversation[] = []

    while (page <= totalPages) {
      const res = await pb.collection<Conversation>('conversations').getList(page, pageSize, {
        filter,
        sort: '-last_message_at',
        requestKey: null,
      })
      if (res?.items && res.items.length > 0) {
        allItems.push(...res.items)
      }
      totalPages = res.totalPages || 1
      if (page >= totalPages || res.items.length === 0) {
        break
      }
      page++
    }

    if (allItems.length > 0) {
      return allItems
    }
  } catch (err) {
    console.warn('Aviso ao buscar conversas via getList paginado:', err)
  }

  // Fallback getFullList com batch explícito
  return pb.collection<Conversation>('conversations').getFullList({
    filter,
    sort: '-last_message_at',
    batch: 200,
    requestKey: null,
  })
}

/**
 * Retorna a contagem real total de conversas no servidor para o usuário especificado.
 */
export async function countConversations(userId?: string): Promise<number> {
  const currentUserId = userId || pb.authStore.record?.id
  const filter = currentUserId ? `user = "${currentUserId}"` : undefined
  try {
    const res = await pb.collection<Conversation>('conversations').getList(1, 1, {
      filter,
      fields: 'id',
      requestKey: null,
    })
    return res.totalItems
  } catch (err) {
    console.warn('Aviso ao obter totalItems de conversas:', err)
    return 0
  }
}

export async function listMessages(userId?: string, sinceSentAt?: string) {
  const currentUserId = userId || pb.authStore.record?.id
  let filter = currentUserId
    ? `user = "${currentUserId}" || conversation.user = "${currentUserId}"`
    : undefined

  // Se já temos sent_at conhecido (ex: polling incremental),
  // busca apenas mensagens com sent_at posterior para evitar puxar múltiplas páginas
  if (sinceSentAt) {
    const timeFilter = `sent_at > "${sinceSentAt}"`
    filter = filter ? `(${filter}) && ${timeFilter}` : timeFilter
  }

  // Tentar chamada com retry exponencial caso ocorra rate limit (429 Too Many Requests)
  const maxRetries = 3
  let delay = 1000

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await pb.collection<Message>('messages').getFullList({
        filter,
        sort: 'sent_at',
        batch: 200,
        requestKey: null,
      })
    } catch (err: unknown) {
      const isRateLimit =
        Boolean(
          err &&
          typeof err === 'object' &&
          'status' in err &&
          (err as { status: number }).status === 429,
        ) ||
        Boolean(
          err &&
          typeof err === 'object' &&
          'message' in err &&
          String((err as { message: string }).message).includes('429'),
        )

      if (isRateLimit && attempt < maxRetries) {
        console.warn(
          `[listMessages] 429 Too Many Requests detectado. Aguardando ${delay}ms para retry (tentativa ${attempt + 1}/${maxRetries})...`,
        )
        await new Promise((resolve) => setTimeout(resolve, delay))
        delay *= 2 // backoff exponencial
      } else {
        if (isRateLimit) {
          console.warn(
            '[listMessages] 429 persistiu após retries. Retornando lista vazia para evitar quebra da UI.',
          )
          return []
        }
        throw err
      }
    }
  }

  return []
}

export async function listMessagesForConversation(conversationId: string, userId?: string) {
  if (!conversationId) return []
  const currentUserId = userId || pb.authStore.record?.id
  const filter = currentUserId
    ? `conversation = "${conversationId}" && (user = "${currentUserId}" || conversation.user = "${currentUserId}")`
    : `conversation = "${conversationId}"`

  const maxRetries = 3
  let delay = 1000

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await pb.collection<Message>('messages').getFullList({
        filter,
        sort: 'sent_at',
        requestKey: null,
      })
    } catch (err: unknown) {
      const isRateLimit =
        Boolean(
          err &&
          typeof err === 'object' &&
          'status' in err &&
          (err as { status: number }).status === 429,
        ) ||
        Boolean(
          err &&
          typeof err === 'object' &&
          'message' in err &&
          String((err as { message: string }).message).includes('429'),
        )

      if (isRateLimit && attempt < maxRetries) {
        console.warn(
          `[listMessagesForConversation] 429 detectado. Aguardando ${delay}ms para retry...`,
        )
        await new Promise((resolve) => setTimeout(resolve, delay))
        delay *= 2
      } else {
        if (isRateLimit) return []
        throw err
      }
    }
  }

  return []
}

export async function listFollowUps(userId?: string) {
  const currentUserId = userId || pb.authStore.record?.id
  const filter = currentUserId
    ? `user = "${currentUserId}" || conversation.user = "${currentUserId}"`
    : undefined
  return pb.collection<FollowUp>('follow_ups').getFullList({
    filter,
    sort: 'due_at',
  })
}

export async function createFollowUp(
  conversation: string,
  title: string,
  dueAt: string,
  userId?: string,
) {
  const currentUserId = userId || pb.authStore.record?.id
  return pb.collection<FollowUp>('follow_ups').create({
    conversation,
    title,
    due_at: dueAt,
    done: false,
    ...(currentUserId ? { user: currentUserId } : {}),
  })
}

export async function completeFollowUp(id: string) {
  return pb.collection<FollowUp>('follow_ups').update(id, { done: true })
}

export async function markConversationResponded(id: string) {
  const now = new Date().toISOString()
  return pb.collection<Conversation>('conversations').update(id, {
    status: 'acompanhamento',
    last_direction: 'out',
    last_message_at: now,
    responded_at: now,
  })
}

export async function addConversation(
  data: { name: string; phone: string; summary: string },
  userId?: string,
) {
  const currentUserId = userId || pb.authStore.record?.id
  const now = new Date().toISOString()
  return pb.collection<Conversation>('conversations').create({
    ...data,
    status: 'sem_resposta',
    last_message_at: now,
    last_direction: 'in',
    intent: 'Iniciar atendimento',
    temperature: 'morno',
    next_action: 'Entender a necessidade do novo contato.',
    ...(currentUserId ? { user: currentUserId } : {}),
  })
}
