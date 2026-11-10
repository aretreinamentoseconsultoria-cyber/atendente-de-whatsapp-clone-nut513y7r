import type { RecordModel } from 'pocketbase'

export type ConversationStatus =
  | 'sem_resposta'
  | 'madrugada'
  | 'followup'
  | 'acompanhamento'
  | 'respondida'
export type Temperature = 'quente' | 'morno' | 'frio'

export interface Conversation extends RecordModel {
  id: string
  name: string
  phone: string
  status: ConversationStatus
  last_message_at: string
  last_direction: 'in' | 'out'
  summary: string
  intent: string
  temperature: Temperature
  next_action: string
  responded_at?: string
  zernio_id?: string
  zernio_account_id?: string
  avatar_url?: string
}

export interface Message extends RecordModel {
  id: string
  conversation: string
  direction: 'in' | 'out'
  body: string
  sent_at: string
  zernio_id?: string
  media_url?: string
  media_type?: string
  transcription?: string
}

export interface FollowUp extends RecordModel {
  id: string
  conversation: string
  title: string
  due_at: string
  done: boolean
}
