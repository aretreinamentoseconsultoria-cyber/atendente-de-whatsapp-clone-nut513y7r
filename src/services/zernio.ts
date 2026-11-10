import type { RecordModel } from 'pocketbase'
import pb from '@/lib/pocketbase/client'

export type OperationMode = 'read_only' | 'read_write'

export interface ZernioSettings extends RecordModel {
  id: string
  key: string
  operation_mode: OperationMode
  is_connected: boolean
  zernio_api_key?: string
  zernio_account_id?: string
  zernio_phone_number_id?: string
  last_tested_at?: string
  last_synced_at?: string
  test_status_message?: string
}

export interface ZernioAccountItem {
  id: string
  platform: string
  username: string
  displayName: string
  phoneNumber?: string
  avatarUrl?: string
  isActive?: boolean
  profileName?: string
}

export interface ZernioSecretsStatus {
  ZERNIO_API_KEY: boolean
  ZERNIO_ACCOUNT_ID: boolean
  ZERNIO_PHONE_ID: boolean
  ZERNIO_WEBHOOK_SECRET: boolean
}

export interface ZernioStatusResponse {
  success: boolean
  secrets: ZernioSecretsStatus
  allRequiredConfigured: boolean
  allConfigured: boolean
  isConnected: boolean
  operationMode: OperationMode
  lastTestedAt?: string
  lastSyncedAt?: string
  testStatusMessage?: string
  selectedAccountId?: string
  selectedPhoneNumberId?: string
  distinctAccountsCount?: number
  hasSavedAccount?: boolean
  realConversationsCount?: number
  registeredWebhooksCount?: number
  registeredWebhooks?: Array<{
    _id?: string
    name?: string
    url?: string
    events?: string[]
    isActive?: boolean
  }>
}

export interface TestConnectionResponse {
  success: boolean
  connected: boolean
  message: string
  conversationsCount?: number
  accounts?: ZernioAccountItem[]
  selectedAccountId?: string
  autoSelected?: boolean
  statusCode?: number
  details?: unknown
  code?: string
}

export interface SyncResponse {
  success: boolean
  message: string
  conversationsSynced?: number
  messagesSynced?: number
  failedItems?: number
  isPartial?: boolean
  errors?: string[]
  code?: string
}

export interface SendMessageResponse {
  success: boolean
  message: string
  messageRecordId?: string
  zernioResponse?: unknown
  code?: string
  hoursSinceInbound?: number
}

export type TemplateCategory = 'UTILITY' | 'MARKETING' | 'AUTHENTICATION'

export interface TemplateButton {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'
  text: string
  url?: string
  phoneNumber?: string
  example?: string[]
}

export interface WhatsAppTemplateComponent {
  type: string
  text?: string
  format?: string
  example?: {
    body_text?: string[][]
    header_text?: string[]
    header_handle?: string[]
  }
  buttons?: Array<{
    type: string
    text: string
    url?: string
    phone_number?: string
    example?: string[]
  }>
}

export interface WhatsAppTemplate {
  id?: string
  name: string
  category: TemplateCategory | string
  language: string
  status?: 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED' | 'DISABLED' | string
  rejected_reason?: string
  components?: WhatsAppTemplateComponent[]
  body?: string
  created_at?: string
  updated_at?: string
  quality_score?: {
    score?: string
  }
}

export interface CreateTemplatePayload {
  name: string
  category: TemplateCategory
  language?: string
  body: string
  headerText?: string
  headerExample?: string
  footerText?: string
  buttons?: TemplateButton[]
  components?: WhatsAppTemplateComponent[]
  examples?: Record<string, string> | string[]
  buttonUrlExample?: string
}

export interface SetupWebhookResponse {
  success: boolean
  message: string
  rawError?: string
  webhookUrl?: string
  created?: boolean
  alreadyRegistered?: boolean
  secretConfigured?: boolean
  webhook?: unknown
  code?: string
  details?: unknown
  statusCode?: number
}

/**
 * Normaliza mensagens de erro da API ou da Zernio para formato limpo e amigável ao usuário.
 * Evita expor mensagens gigantes com listas completas de enum ou dumps JSON no toast/UI.
 */
export function sanitizeWebhookErrorMessage(rawMessage?: string, statusCode?: number): string {
  if (!rawMessage) {
    return 'Não foi possível cadastrar o webhook automaticamente na Zernio.'
  }

  const str = String(rawMessage)

  // Rejeição por opção inválida de eventos
  if (
    str.includes('Invalid option') ||
    str.includes('expected one of') ||
    str.includes('evento inválido')
  ) {
    return 'A Zernio rejeitou um evento inválido — lista corrigida, tente novamente.'
  }

  // Falha de autenticação
  if (statusCode === 401 || str.includes('HTTP 401') || str.includes('Unauthorized')) {
    return 'Chave da API da Zernio inválida ou expirada. Verifique nas Configurações.'
  }

  // Falha de autorização / feature
  if (statusCode === 403 || str.includes('HTTP 403') || str.includes('Forbidden')) {
    return 'Sua conta Zernio não possui permissão para cadastrar webhooks no plano atual.'
  }

  // Se for mensagem JSON stringificada ou muito longa (> 150 caracteres)
  if (str.startsWith('{') || str.length > 150) {
    return 'A Zernio retornou erro ao configurar o webhook. Tente novamente em instantes.'
  }

  return str
}

const SETTINGS_KEY = 'whatsapp_zernio'

/**
 * Busca a configuração salva da Zernio (preferências e status não-sensíveis)
 */
export async function getZernioSettings(): Promise<ZernioSettings | null> {
  try {
    const currentUserId = pb.authStore.record?.id
    const filter = currentUserId
      ? `key = "${SETTINGS_KEY}" && user = "${currentUserId}"`
      : `key = "${SETTINGS_KEY}"`
    const record = await pb.collection('app_settings').getFirstListItem<ZernioSettings>(filter)
    return record
  } catch {
    return null
  }
}

/**
 * Consulta a detecção de secrets no backend e status operacional
 */
export async function getZernioStatus(): Promise<ZernioStatusResponse> {
  return pb.send<ZernioStatusResponse>('/backend/v1/zernio/status', {
    method: 'GET',
  })
}

/**
 * Salva ou atualiza preferências não-sensíveis da Zernio (modo de operação, account_id escolhido)
 */
export async function saveZernioSettings(
  data: Partial<
    Pick<
      ZernioSettings,
      | 'operation_mode'
      | 'is_connected'
      | 'test_status_message'
      | 'zernio_api_key'
      | 'zernio_account_id'
      | 'zernio_phone_number_id'
    >
  >,
): Promise<ZernioSettings> {
  const currentUserId = pb.authStore.record?.id
  const existing = await getZernioSettings()
  if (existing?.id) {
    return pb.collection('app_settings').update<ZernioSettings>(existing.id, {
      ...data,
      ...(currentUserId && !existing.user ? { user: currentUserId } : {}),
    })
  }
  return pb.collection('app_settings').create<ZernioSettings>({
    key: SETTINGS_KEY,
    operation_mode: 'read_only',
    is_connected: false,
    ...(currentUserId ? { user: currentUserId } : {}),
    ...data,
  })
}

// Cache e deduplicação em memória para chamadas concorrentes/sequenciais de testZernioConnection
const testConnectionCache = new Map<string, { timestamp: number; data: TestConnectionResponse }>()
const inFlightTestConnection = new Map<string, Promise<TestConnectionResponse>>()
const TEST_CACHE_TTL_MS = 60 * 1000 // 60 segundos de cache para testes com os mesmos parâmetros

/**
 * Testa a conexão com a API da Zernio usando os secrets configurados no backend
 * e descobre as contas/números WhatsApp disponíveis.
 * Possui debouncing, deduplicação in-flight e cache em memória para evitar tempestade de requisições.
 */
export async function testZernioConnection(
  apiKey?: string,
  forceRefresh = false,
): Promise<TestConnectionResponse> {
  const normalizedKey = apiKey ? apiKey.trim() : 'DEFAULT'

  if (!forceRefresh) {
    const cached = testConnectionCache.get(normalizedKey)
    if (cached && Date.now() - cached.timestamp < TEST_CACHE_TTL_MS) {
      return cached.data
    }
  }

  const existingPromise = inFlightTestConnection.get(normalizedKey)
  if (existingPromise) {
    return existingPromise
  }

  const promise = (async () => {
    try {
      const res = await pb.send<TestConnectionResponse>('/backend/v1/zernio/test', {
        method: 'POST',
        body: apiKey ? { apiKey: apiKey.trim() } : {},
      })
      testConnectionCache.set(normalizedKey, { timestamp: Date.now(), data: res })
      return res
    } finally {
      inFlightTestConnection.delete(normalizedKey)
    }
  })()

  inFlightTestConnection.set(normalizedKey, promise)
  return promise
}

/**
 * Sincroniza conversas e mensagens recentes da Zernio via secrets do backend
 * Permite passar explicitamente o accountId selecionado.
 */
export async function syncZernioConversations(accountId?: string): Promise<SyncResponse> {
  return pb.send<SyncResponse>('/backend/v1/zernio/sync', {
    method: 'POST',
    body: accountId ? { accountId } : {},
  })
}

/**
 * Fornece formato amigável de telefone brasileiro (+55 XX XXXXX-XXXX)
 */
export function formatPhoneNumber(phone?: string): string {
  if (!phone) return ''
  const clean = phone.replace(/\D/g, '')
  if (clean.length === 13 && clean.startsWith('55')) {
    return `+55 ${clean.slice(2, 4)} ${clean.slice(4, 9)}-${clean.slice(9)}`
  }
  if (clean.length === 12 && clean.startsWith('55')) {
    return `+55 ${clean.slice(2, 4)} ${clean.slice(4, 8)}-${clean.slice(8)}`
  }
  if (clean.length === 11) {
    return `+55 ${clean.slice(0, 2)} ${clean.slice(2, 7)}-${clean.slice(7)}`
  }
  if (clean.length === 10) {
    return `+55 ${clean.slice(0, 2)} ${clean.slice(2, 6)}-${clean.slice(6)}`
  }
  return phone
}

/**
 * Envia uma mensagem via Zernio respeitando a janela de 24 horas
 */
export async function sendZernioMessage(
  conversationId: string,
  message: string,
  options?: {
    templateName?: string
    templateLanguage?: string
    templateVariables?: Record<string, string>
  },
): Promise<SendMessageResponse> {
  return pb.send<SendMessageResponse>('/backend/v1/zernio/send', {
    method: 'POST',
    body: {
      conversationId,
      message,
      ...(options?.templateName ? { templateName: options.templateName } : {}),
      ...(options?.templateLanguage ? { templateLanguage: options.templateLanguage } : {}),
      ...(options?.templateVariables ? { templateVariables: options.templateVariables } : {}),
    },
  })
}

/**
 * Lista todos os templates de mensagem da Zernio (GET /backend/v1/zernio/templates)
 */
export async function listZernioTemplates(): Promise<WhatsAppTemplate[]> {
  try {
    const res = await pb.send<{
      success: boolean
      templates?: WhatsAppTemplate[]
    }>('/backend/v1/zernio/templates', {
      method: 'GET',
    })
    return res?.templates || []
  } catch (err) {
    console.warn('Erro ao listar templates da Zernio:', err)
    return []
  }
}

/**
 * Cria um template e o submete à aprovação da Meta via Zernio (POST /backend/v1/zernio/templates)
 */
export async function createZernioTemplate(
  payload: CreateTemplatePayload,
): Promise<{ success: boolean; message: string; template?: unknown }> {
  return pb.send<{ success: boolean; message: string; template?: unknown }>(
    '/backend/v1/zernio/templates',
    {
      method: 'POST',
      body: payload,
    },
  )
}

/**
 * Exclui um template na Zernio e na Meta (DELETE /backend/v1/zernio/templates/:id)
 */
export async function deleteZernioTemplate(
  templateIdOrName: string,
): Promise<{ success: boolean; message: string }> {
  return pb.send<{ success: boolean; message: string }>(
    `/backend/v1/zernio/templates/${encodeURIComponent(templateIdOrName)}`,
    {
      method: 'DELETE',
    },
  )
}

/**
 * Cadastra o webhook automaticamente na API da Zernio usando a API Key e secret configurados
 */
export async function setupZernioWebhook(apiKey?: string): Promise<SetupWebhookResponse> {
  try {
    const body: Record<string, string> = {
      webhookUrl: 'https://atendente-de-whatsapp-04cc6.shrd00.internal.goskip.dev',
    }
    if (apiKey) {
      body.apiKey = apiKey.trim()
    }
    return await pb.send<SetupWebhookResponse>('/backend/v1/zernio/webhook-setup', {
      method: 'POST',
      body,
    })
  } catch (err: unknown) {
    // Caso a chamada lance um ClientResponseError com status 403, 401 ou outro
    const errObj = err as {
      status?: number
      response?: {
        message?: string
        code?: string
        details?: unknown
      }
      message?: string
    }
    const responseData = errObj?.response
    if (responseData && typeof responseData === 'object' && responseData.message) {
      const friendlyMsg = sanitizeWebhookErrorMessage(responseData.message, errObj.status)
      return {
        success: false,
        code: responseData.code || 'REQUEST_FAILED',
        message: friendlyMsg,
        rawError: responseData.message,
        details: responseData.details,
        statusCode: errObj.status,
      }
    }
    throw err
  }
}
