import pb from '@/lib/pocketbase/client'
import type { FollowUp } from '@/types/inbox'

export async function listFollowUps(userId?: string): Promise<FollowUp[]> {
  const currentUserId = userId || pb.authStore.record?.id
  const filter = currentUserId
    ? `user = "${currentUserId}" || conversation.user = "${currentUserId}"`
    : undefined
  const records = await pb.collection('follow_ups').getFullList({
    filter,
    sort: 'due_at',
  })
  return records as unknown as FollowUp[]
}

export async function createFollowUp(
  data: Omit<FollowUp, 'id'> & { user?: string },
): Promise<FollowUp> {
  const currentUserId = data.user || pb.authStore.record?.id
  const record = await pb.collection('follow_ups').create({
    ...data,
    ...(currentUserId ? { user: currentUserId } : {}),
  })
  return record as unknown as FollowUp
}

export async function completeFollowUp(id: string): Promise<FollowUp> {
  const record = await pb.collection('follow_ups').update(id, { done: true })
  return record as unknown as FollowUp
}
