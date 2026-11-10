export type RailSection = 'responder' | 'madrugada' | 'followups' | 'todas'

export type ConversationStatus =
  | 'sem_resposta'
  | 'madrugada'
  | 'followup'
  | 'acompanhamento'
  | 'respondida'

export type LeadTemperature = 'quente' | 'morno' | 'frio'
export type MessageDirection = 'in' | 'out'

export interface Conversation {
  id: string
  name: string
  phone: string
  status: ConversationStatus
  last_message_at: string
  last_direction: MessageDirection
  summary: string
  intent: string
  temperature: LeadTemperature
  next_action: string
  responded_at?: string
  zernio_id?: string
  zernio_account_id?: string
  avatar_url?: string
  created?: string
  updated?: string
}

export interface Message {
  id: string
  conversation: string
  direction: MessageDirection
  body: string
  sent_at: string
  created?: string
  updated?: string
  media_url?: string
  media_type?: string
  transcription?: string
}

export interface FollowUp {
  id: string
  conversation: string
  title: string
  due_at: string
  done: boolean
  created?: string
  updated?: string
}

export interface InboxSnapshot {
  conversations: Conversation[]
  messages: Message[]
  followUps: FollowUp[]
}
