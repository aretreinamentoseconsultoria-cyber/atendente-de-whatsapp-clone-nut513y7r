import pb from '@/lib/pocketbase/client'
import type { Conversation } from '@/types/inbox'

export async function listConversations(userId?: string): Promise<Conversation[]> {
  const currentUserId = userId || pb.authStore.record?.id
  const filter = currentUserId ? `user = "${currentUserId}"` : undefined

  try {
    const pageSize = 200
    let page = 1
    let totalPages = 1
    const allItems: Conversation[] = []

    while (page <= totalPages) {
      const res = await pb.collection('conversations').getList(page, pageSize, {
        filter,
        sort: '-last_message_at',
        requestKey: null,
      })
      if (res?.items && res.items.length > 0) {
        allItems.push(...(res.items as unknown as Conversation[]))
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

  const records = await pb.collection('conversations').getFullList({
    filter,
    sort: '-last_message_at',
    batch: 200,
    requestKey: null,
  })
  return records as unknown as Conversation[]
}

export async function updateConversation(
  id: string,
  data: Partial<Conversation> | Record<string, unknown>,
): Promise<Conversation> {
  const record = await pb.collection('conversations').update(id, data)
  return record as unknown as Conversation
}
