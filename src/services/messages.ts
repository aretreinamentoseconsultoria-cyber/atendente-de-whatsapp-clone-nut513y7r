import pb from '@/lib/pocketbase/client'
import type { Message } from '@/types/inbox'

export async function listMessages(userId?: string): Promise<Message[]> {
  const currentUserId = userId || pb.authStore.record?.id
  const filter = currentUserId
    ? `user = "${currentUserId}" || conversation.user = "${currentUserId}"`
    : undefined

  const maxRetries = 3
  let delay = 1000

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const records = await pb.collection('messages').getFullList({
        filter,
        sort: 'sent_at',
        batch: 200,
        requestKey: null,
      })
      return records as unknown as Message[]
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
          `[messages:listMessages] 429 Too Many Requests detectado. Aguardando ${delay}ms para retry...`,
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

export async function createMessage(
  data: Omit<Message, 'id'> & { user?: string },
): Promise<Message> {
  const currentUserId = data.user || pb.authStore.record?.id
  const record = await pb.collection('messages').create({
    ...data,
    ...(currentUserId ? { user: currentUserId } : {}),
  })
  return record as unknown as Message
}
