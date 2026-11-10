import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { toast } from 'sonner'
import { useRealtime } from '@/hooks/use-realtime'
import { useAuth } from '@/contexts/AuthContext'
import {
  completeFollowUp,
  createFollowUp,
  listConversations,
  listFollowUps,
  listMessages,
  listMessagesForConversation,
  markConversationResponded,
} from '@/services/crm'
import pb from '@/lib/pocketbase/client'
import {
  formatPhoneNumber,
  getZernioSettings,
  testZernioConnection,
  type SyncResponse,
  type ZernioAccountItem,
  type ZernioSettings,
} from '@/services/zernio'
import { sanitizeDisplayName } from '@/lib/format'
import type { Conversation, FollowUp, Message } from '@/types/crm'

export type AccountProfile = {
  id: string
  name: string
  phone: string
  label: string
  count: number
  color: string
  avatarUrl?: string
}

type CrmContextValue = {
  conversations: Conversation[]
  messages: Message[]
  followUps: FollowUp[]
  loading: boolean
  searchQuery: string
  setSearchQuery: (q: string) => void
  syncing: boolean
  triggerSync: () => Promise<void>
  refresh: (isInitial?: boolean) => Promise<void>
  createFollowUp: (conversation: string, title: string, dueAt: string) => Promise<void>
  completeFollowUp: (id: string) => Promise<void>
  markResponded: (id: string) => Promise<void>
  zernioSettings: import('@/services/zernio').ZernioSettings | null
  refreshZernioSettings: () => Promise<void>
  selectedAccountId: string
  setSelectedAccountId: (id: string) => void
  knownAccounts: AccountProfile[]
  activeAccount: AccountProfile | null
  filteredConversations: Conversation[]
  getViaLabel: (accountId?: string) => string
  loadConversationMessages: (
    conversationId: string,
  ) => Promise<{ messages: Message[]; error?: string }>
}

const CrmContext = createContext<CrmContextValue | null>(null)

const getProfileStorageKey = (userId?: string) =>
  userId ? `fernand_selected_profile_id_${userId}` : 'fernand_selected_profile_id_guest'

export function CrmProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [zernioSettings, setZernioSettings] = useState<ZernioSettings | null>(null)
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [selectedAccountId, setSelectedAccountIdState] = useState<string>('all')
  const [discoveredAccounts, setDiscoveredAccounts] = useState<ZernioAccountItem[]>([])

  // Carrega a conta selecionada sempre que o usuário muda
  useEffect(() => {
    if (!user) {
      setSelectedAccountIdState('all')
      setDiscoveredAccounts([])
      return
    }
    try {
      const key = getProfileStorageKey(user.id)
      const stored = localStorage.getItem(key)
      setSelectedAccountIdState(stored || 'all')
    } catch {
      setSelectedAccountIdState('all')
    }
  }, [user])

  const setSelectedAccountId = useCallback(
    (id: string) => {
      setSelectedAccountIdState(id)
      try {
        const key = getProfileStorageKey(user?.id)
        localStorage.setItem(key, id)
      } catch {
        // ignore
      }
    },
    [user?.id],
  )

  const refreshZernioSettings = useCallback(async () => {
    try {
      const settings = await getZernioSettings()
      setZernioSettings(settings)
    } catch {
      // Ignora falha silenciosa em settings
    }
  }, [])

  const messagesRef = useRef<Message[]>([])
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const refresh = useCallback(
    async (isInitial = false) => {
      if (!user) {
        setConversations([])
        setMessages([])
        setFollowUps([])
        setDiscoveredAccounts([])
        setLoading(false)
        return
      }
      if (isInitial) {
        setLoading(true)
      }
      const userId = user.id

      // Busca incremental: se não for carga inicial e já houver mensagens em memória,
      // busca apenas as novas pelo sent_at mais recente para poupar requisições e evitar 429
      const currentMsgs = messagesRef.current
      const latestSentAt =
        !isInitial && currentMsgs.length > 0
          ? currentMsgs[currentMsgs.length - 1].sent_at ||
            currentMsgs[currentMsgs.length - 1].created
          : undefined

      // Primeiro busca as configurações locais do usuário
      const [cRes, mRes, fRes, sRes] = await Promise.allSettled([
        listConversations(userId),
        listMessages(userId, latestSentAt),
        listFollowUps(userId),
        getZernioSettings(),
      ])

      if (cRes.status === 'fulfilled') {
        setConversations(sortConversations(cRes.value))
      }
      if (mRes.status === 'fulfilled') {
        const fetched = mRes.value
        if (latestSentAt && fetched.length > 0) {
          setMessages((prev) => sortMessages([...prev, ...fetched]))
        } else if (!latestSentAt) {
          setMessages(sortMessages(fetched))
        }
      }
      if (fRes.status === 'fulfilled') {
        setFollowUps(fRes.value)
      }

      let currentSettings: ZernioSettings | null = null
      if (sRes.status === 'fulfilled') {
        currentSettings = sRes.value
        setZernioSettings(currentSettings)
      }

      // Apenas busca contas na Zernio se o usuário tem integração configurada com API key própria
      // ou se for estritamente o dono principal fabiano@adapta.org que detém o secret global ZERNIO_API_KEY.
      // Usuários demo (como videos@adapta.org) ou contas comuns sem chave NUNCA consultam a Zernio via secret global.
      // OTIMIZAÇÃO CRÍTICA DE RATE LIMIT: O teste de conexão /backend/v1/zernio/test é pesado e NÃO deve ser
      // disparado a cada refresh() de 12s nem na montagem repetida se já foi validado recentemente (cache por 10 min).
      const isOwner = user.email === 'fabiano@adapta.org'
      const isDemoUser = user.email === 'videos@adapta.org'
      const hasCustomApiKey = Boolean(currentSettings?.zernio_api_key?.trim())
      const shouldQueryZernioAccounts = !isDemoUser && (hasCustomApiKey || isOwner)

      if (shouldQueryZernioAccounts) {
        const cacheKey = `zernio_accounts_${user.id}`
        const lastTestTimeKey = `zernio_accounts_time_${user.id}`
        const cachedRaw = sessionStorage.getItem(cacheKey)
        const cachedTime = Number(sessionStorage.getItem(lastTestTimeKey) || 0)
        const nowMs = Date.now()
        const isFresh = cachedRaw && nowMs - cachedTime < 10 * 60 * 1000 // 10 minutos de cache

        if (isFresh) {
          try {
            const parsed = JSON.parse(cachedRaw) as ZernioAccountItem[]
            setDiscoveredAccounts(parsed)
          } catch {
            // fallback
          }
        } else {
          try {
            const testRes = await testZernioConnection()
            if (testRes?.accounts && testRes.accounts.length > 0) {
              setDiscoveredAccounts(testRes.accounts)
              sessionStorage.setItem(cacheKey, JSON.stringify(testRes.accounts))
              sessionStorage.setItem(lastTestTimeKey, String(nowMs))
            } else {
              setDiscoveredAccounts([])
            }
          } catch {
            // Falha no teste não quebra o carregamento da tela
            setDiscoveredAccounts([])
          }
        }
      } else {
        setDiscoveredAccounts([])
      }

      if (cRes.status === 'rejected' && mRes.status === 'rejected' && fRes.status === 'rejected') {
        toast.error('Não foi possível carregar os dados do atendimento.')
      }
      setLoading(false)
    },
    [user],
  )

  // Helper para upsert suave no state sem wipe
  const upsertRecord = <T extends { id: string }>(items: T[], record: T, action: string): T[] => {
    if (action === 'delete') {
      return items.filter((item) => item.id !== record.id)
    }
    const index = items.findIndex((item) => item.id === record.id)
    if (index === -1) {
      return [...items, record]
    }
    const copy = [...items]
    copy[index] = record
    return copy
  }

  // Ordenação garantida de conversas por data da última mensagem (Newest first)
  const sortConversations = (list: Conversation[]): Conversation[] => {
    return [...list].sort((a, b) => {
      const timeA = new Date(a.last_message_at || a.updated || a.created).getTime() || 0
      const timeB = new Date(b.last_message_at || b.updated || b.created).getTime() || 0
      return timeB - timeA
    })
  }

  // Ordenação e deduplicação garantida de mensagens em ordem cronológica (mais antiga para mais recente)
  const sortMessages = (list: Message[]): Message[] => {
    const sorted = [...list].sort((a, b) => {
      const timeA = new Date(a.sent_at || a.created).getTime() || 0
      const timeB = new Date(b.sent_at || b.created).getTime() || 0
      if (timeA !== timeB) return timeA - timeB
      return (a.created || '').localeCompare(b.created || '')
    })

    // Remove eventuais duplicatas por id
    const seen = new Set<string>()
    return sorted.filter((item) => {
      if (seen.has(item.id)) return false
      seen.add(item.id)
      return true
    })
  }

  useEffect(() => {
    void refresh(true)

    // Backfill silencioso de avatars ao inicializar:
    // Apenas para o usuário dono da integração oficial (fabiano@adapta.org) ou usuário que tiver chave própria.
    // NUNCA disparar para usuários de demonstração (videos@adapta.org) ou usuários sem credenciais Zernio.
    const runInitialAvatarSync = async () => {
      try {
        if (!user || user.email === 'videos@adapta.org') return
        const isOwner = user.email === 'fabiano@adapta.org'
        // Se não for o dono e não tiver chave própria confirmada, não faz sync
        if (!isOwner && !zernioSettings?.zernio_api_key) return

        const hasRun = sessionStorage.getItem('zernio_initial_avatar_sync_done')
        if (!hasRun) {
          sessionStorage.setItem('zernio_initial_avatar_sync_done', 'true')
          const syncRes = await pb.send<SyncResponse>('/backend/v1/zernio/sync', {
            method: 'POST',
            body: {},
          })
          if (syncRes && syncRes.conversationsSynced > 0) {
            void refresh()
          }
        }
      } catch {
        // Silencioso se erro transitório
      }
    }

    if (user && user.email !== 'videos@adapta.org') {
      void runInitialAvatarSync()
    }
  }, [refresh, user])

  // Realtime granular sem disparar refresh() total que limpava listas e causava flickering
  useRealtime<Conversation>(
    'conversations',
    (event) => {
      if (event.record) {
        const rec = event.record as unknown as Conversation & { user?: string }
        // Defesa em profundidade no cliente: descartar eventos de conversas de outro usuário
        if (rec.user && user?.id && rec.user !== user.id) {
          return
        }
        setConversations((current) =>
          sortConversations(
            upsertRecord(current, event.record as unknown as Conversation, event.action),
          ),
        )
      }
    },
    Boolean(user),
  )

  useRealtime<Message>(
    'messages',
    (event) => {
      if (event.record) {
        const rec = event.record as unknown as Message & { user?: string }
        // Defesa em profundidade no cliente: descartar mensagens de outro usuário
        if (rec.user && user?.id && rec.user !== user.id) {
          return
        }
        setMessages((current) =>
          sortMessages(upsertRecord(current, event.record as unknown as Message, event.action)),
        )
      }
    },
    Boolean(user),
  )

  // Polling resiliente de suporte a webhooks/realtime:
  // A cada 30 segundos (ou quando a janela ganha foco com debounce), busca atualizações silenciosas
  useEffect(() => {
    if (!user || user.email === 'videos@adapta.org') return

    const pollInterval = setInterval(() => {
      // Atualização silenciosa incremental em segundo plano sem zerar listas
      void refresh()
    }, 30000)

    let focusTimeout: ReturnType<typeof setTimeout> | null = null
    const handleFocus = () => {
      if (focusTimeout) clearTimeout(focusTimeout)
      focusTimeout = setTimeout(() => {
        void refresh()
      }, 1000)
    }

    window.addEventListener('focus', handleFocus)

    return () => {
      clearInterval(pollInterval)
      if (focusTimeout) clearTimeout(focusTimeout)
      window.removeEventListener('focus', handleFocus)
    }
  }, [refresh, user])

  useRealtime<FollowUp>(
    'follow_ups',
    (event) => {
      if (event.record) {
        const rec = event.record as unknown as FollowUp & { user?: string }
        // Defesa em profundidade no cliente: descartar follow-ups de outro usuário
        if (rec.user && user?.id && rec.user !== user.id) {
          return
        }
        setFollowUps((current) =>
          upsertRecord(current, event.record as unknown as FollowUp, event.action),
        )
      }
    },
    Boolean(user),
  )

  useRealtime<ZernioSettings>('app_settings', () => void refreshZernioSettings(), Boolean(user))

  // Mapeamento dinâmico de contas/números WhatsApp encontrados APENAS nas conversas do próprio usuário
  // ou via API Zernio caso ele tenha integração ativa
  const knownAccounts = useMemo<AccountProfile[]>(() => {
    // Filtrar conversas garantidamente pertencentes ao usuário logado
    const userConversations = user?.id
      ? conversations.filter((c) => !c.user || c.user === user.id)
      : conversations

    const map = new Map<string, { id: string; count: number }>()
    userConversations.forEach((c) => {
      if (c.zernio_account_id) {
        const existing = map.get(c.zernio_account_id)
        if (existing) {
          existing.count++
        } else {
          map.set(c.zernio_account_id, {
            id: c.zernio_account_id,
            count: 1,
          })
        }
      }
    })

    // Adiciona accounts descobertos via API Zernio caso ainda não tenham conversas salvas
    // (apenas se for o usuário dono da integração ou com chave própria, NUNCA para o usuário demo)
    if (user?.email !== 'videos@adapta.org') {
      discoveredAccounts.forEach((disc) => {
        if (disc.id && !map.has(disc.id)) {
          map.set(disc.id, { id: disc.id, count: 0 })
        }
      })
    }

    // Se o usuário não tem nenhuma conta nem conversa, retorna lista vazia
    if (map.size === 0) {
      return []
    }

    // Mapeamento enriquecido das contas WhatsApp conhecidas por usuário (Fabiano ou Demo de Vídeo)
    const isPrimaryUser = user?.email === 'fabiano@adapta.org'
    const isDemoUser = user?.email === 'videos@adapta.org'
    const accountMetadataMap: Record<string, { name: string; phone: string; avatarUrl?: string }> =
      isPrimaryUser
        ? {
            '6aa2ecec726ebfe037d5194e': {
              name: 'Fabiano da Adapta',
              phone: '+55 11 95502-8850',
            },
            '6aa2ea44726ebfe037d50c28': {
              name: 'Atempus',
              phone: '+55 11 5297-1888',
            },
            '6aa2b4fd726ebfe037d3d6e2': {
              name: 'Fabiano Fabricio',
              phone: 'WhatsApp',
            },
          }
        : isDemoUser
          ? {
              mock_acc_marina_store: {
                name: 'Marina Store',
                phone: '+55 11 98842-1002',
                avatarUrl: 'https://img.usecurling.com/ppl/medium?gender=female&seed=42',
              },
              mock_acc_atendimento_adapta: {
                name: 'Atendimento Adapta',
                phone: '+55 11 97120-4491',
                avatarUrl: 'https://img.usecurling.com/ppl/medium?gender=male&seed=18',
              },
            }
          : {}

    // Mapa dos dados retornados dinamicamente do endpoint /backend/v1/zernio/test
    const apiAccountInfo = new Map<string, { name?: string; phone?: string; avatarUrl?: string }>()
    discoveredAccounts.forEach((acc) => {
      if (acc.id) {
        apiAccountInfo.set(acc.id, {
          name: acc.profileName || acc.displayName || acc.username,
          phone: acc.phoneNumber ? formatPhoneNumber(acc.phoneNumber) : undefined,
          avatarUrl: acc.avatarUrl,
        })
      }
    })

    const dotColors = ['#10B981', '#3B82F6', '#8B5CF6', '#F97316']

    return Array.from(map.values()).map((acc, idx) => {
      const meta = accountMetadataMap[acc.id]
      const dynamicInfo = apiAccountInfo.get(acc.id)

      let rawName = dynamicInfo?.name || meta?.name || `WhatsApp ${idx + 1}`
      const name = sanitizeDisplayName(rawName, null, `WhatsApp ${idx + 1}`)
      let phone = dynamicInfo?.phone || meta?.phone || `WhatsApp ${idx + 1}`
      const avatarUrl = dynamicInfo?.avatarUrl || meta?.avatarUrl || ''

      if (zernioSettings?.zernio_account_id === acc.id && zernioSettings?.zernio_phone_number_id) {
        if (!dynamicInfo?.phone && !meta?.phone) {
          phone = zernioSettings.zernio_phone_number_id
        }
      }

      return {
        id: acc.id,
        name,
        phone,
        label: name,
        avatarUrl,
        count: acc.count,
        color: dotColors[idx % dotColors.length],
      }
    })
  }, [conversations, discoveredAccounts, user?.email, user?.id, zernioSettings])

  const triggerSync = useCallback(async () => {
    // Se o usuário é o usuário demo (videos@adapta.org) e não possui chave de API real,
    // não deve acionar sync com API externa nem dar erro de falha; em vez disso, simula ou atualiza localmente
    if (user?.email === 'videos@adapta.org') {
      setSyncing(true)
      try {
        await new Promise((r) => setTimeout(r, 600))
        await refresh()
        toast.success('Conversas da demonstração atualizadas com sucesso.')
      } finally {
        setSyncing(false)
      }
      return
    }

    // Se o usuário não é dono nem tem chave configurada, avisa amigavelmente
    const isOwner = user?.email === 'fabiano@adapta.org'
    if (!isOwner && !zernioSettings?.zernio_api_key) {
      toast.error('Nenhuma chave de API configurada. Conecte sua conta Zernio em Configurações.')
      return
    }

    setSyncing(true)
    try {
      const res = await pb.send<SyncResponse>('/backend/v1/zernio/sync', {
        method: 'POST',
        body: selectedAccountId !== 'all' ? { accountId: selectedAccountId } : {},
      })
      await refresh()
      if (res.isPartial || (res.failedItems && res.failedItems > 0)) {
        const errorDetails =
          Array.isArray(res.errors) && res.errors.length > 0
            ? ` Detalhes: ${res.errors.slice(0, 2).join(' | ')}`
            : ''
        toast.warning(
          `${res.message || `Sincronizadas ${res.conversationsSynced || 0} conversas com ${res.failedItems || 0} pendência(s).`}${errorDetails}`,
        )
      } else {
        toast.success(
          res.message ||
            `Sincronização concluída: ${res.conversationsSynced || 0} conversas atualizadas.`,
        )
      }
    } catch (err: unknown) {
      await refresh()
      const msg = err instanceof Error ? err.message : 'Erro ao sincronizar com a Zernio.'
      toast.error(msg)
    } finally {
      setSyncing(false)
    }
  }, [refresh, selectedAccountId, user?.email, zernioSettings?.zernio_api_key])

  const activeAccount = useMemo(() => {
    if (selectedAccountId === 'all' || knownAccounts.length === 0) return null
    return knownAccounts.find((a) => a.id === selectedAccountId) || null
  }, [knownAccounts, selectedAccountId])

  const filteredConversations = useMemo(() => {
    let list = conversations
    if (selectedAccountId !== 'all') {
      list = list.filter((c) => c.zernio_account_id === selectedAccountId)
    }
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      const cleanDigits = q.replace(/\D/g, '')
      list = list.filter((c) => {
        const nameMatch = (c.name || '').toLowerCase().includes(q)
        const summaryMatch = (c.summary || '').toLowerCase().includes(q)
        const phoneMatch = cleanDigits
          ? (c.phone || '').replace(/\D/g, '').includes(cleanDigits)
          : false
        return nameMatch || summaryMatch || phoneMatch
      })
    }
    return list
  }, [conversations, searchQuery, selectedAccountId])

  // Deduplicação e cache curto de sincronização por conversa para evitar marteladas na Zernio
  const inFlightSyncsRef = useRef<Map<string, Promise<{ messages: Message[]; error?: string }>>>(
    new Map(),
  )
  const lastSyncTimeRef = useRef<Map<string, number>>(new Map())

  const loadConversationMessages = useCallback(
    async (conversationId: string): Promise<{ messages: Message[]; error?: string }> => {
      if (!conversationId || !user) return { messages: [] }

      // Se já houver uma busca em voo para esta conversa, reusa a mesma Promise (deduplicação estrita)
      const existingInFlight = inFlightSyncsRef.current.get(conversationId)
      if (existingInFlight) {
        return existingInFlight
      }

      const syncPromise = (async () => {
        let remoteError = ''
        try {
          let convMsgs = await listMessagesForConversation(conversationId, user.id)

          // Se o banco local não tem mensagens para esta conversa (ou se a última checagem remota foi há mais de 60s),
          // checa se devemos acionar a busca remota sob demanda na Zernio
          const lastCheck = lastSyncTimeRef.current.get(conversationId) || 0
          const shouldCheckRemote =
            convMsgs.length === 0 &&
            Date.now() - lastCheck > 60000 &&
            user.email !== 'videos@adapta.org'

          if (shouldCheckRemote) {
            lastSyncTimeRef.current.set(conversationId, Date.now())
            try {
              const isOwner = user.email === 'fabiano@adapta.org'
              const hasCustomKey = Boolean(zernioSettings?.zernio_api_key?.trim())
              if (isOwner || hasCustomKey) {
                const res = await pb.send<{
                  success: boolean
                  messagesSynced: number
                  totalFetched?: number
                  lastError?: string
                  message?: string
                }>('/backend/v1/zernio/conversation-messages', {
                  method: 'POST',
                  body: { conversationId },
                })
                if (res?.lastError) {
                  remoteError = res.lastError
                }
                // Re-consulta as mensagens gravadas pelo hook
                convMsgs = await listMessagesForConversation(conversationId, user.id)
              }
            } catch (syncErr: unknown) {
              console.warn('Aviso ao sincronizar conversa individual sob demanda:', syncErr)
              remoteError =
                syncErr instanceof Error ? syncErr.message : 'Falha na comunicação com a Zernio'
            }
          }

          if (convMsgs && convMsgs.length > 0) {
            setMessages((current) => {
              const map = new Map<string, Message>()
              current.forEach((m) => map.set(m.id, m))
              convMsgs.forEach((m) => map.set(m.id, m))
              return sortMessages(Array.from(map.values()))
            })
          }
          return { messages: convMsgs, error: remoteError }
        } catch (err: unknown) {
          console.warn('Erro ao carregar mensagens sob demanda da conversa:', err)
          return {
            messages: [],
            error: err instanceof Error ? err.message : 'Erro ao consultar mensagens',
          }
        } finally {
          inFlightSyncsRef.current.delete(conversationId)
        }
      })()

      inFlightSyncsRef.current.set(conversationId, syncPromise)
      return syncPromise
    },
    [user, zernioSettings?.zernio_api_key],
  )

  const getViaLabel = useCallback(
    (accountId?: string) => {
      if (!accountId) return ''
      const acc = knownAccounts.find((a) => a.id === accountId)
      if (acc) return `via ${acc.name || acc.label}`
      if (accountId === '6aa2ecec726ebfe037d5194e') {
        return 'via Fabiano da Adapta'
      }
      if (accountId === '6aa2b4fd726ebfe037d3d6e2') {
        return 'via Fabiano Fabricio'
      }
      if (accountId === '6aa2ea44726ebfe037d50c28') {
        return 'via Atempus'
      }
      if (accountId === 'mock_acc_marina_store') {
        return 'via Marina Store'
      }
      if (accountId === 'mock_acc_atendimento_adapta') {
        return 'via Atendimento Adapta'
      }
      return ''
    },
    [knownAccounts],
  )

  const value = useMemo<CrmContextValue>(
    () => ({
      conversations,
      messages,
      followUps,
      loading,
      searchQuery,
      setSearchQuery,
      syncing,
      triggerSync,
      refresh,
      createFollowUp: async (conversation, title, dueAt) => {
        await createFollowUp(conversation, title, dueAt, user?.id)
        await refresh()
        toast.success('Follow-up criado e adicionado à fila.')
      },
      completeFollowUp: async (id) => {
        await completeFollowUp(id)
        await refresh()
        toast.success('Follow-up concluído ✓')
      },
      markResponded: async (id) => {
        await markConversationResponded(id)
        await refresh()
        toast.success('Conversa marcada como respondida.')
      },
      zernioSettings,
      refreshZernioSettings,
      selectedAccountId,
      setSelectedAccountId,
      knownAccounts,
      activeAccount,
      filteredConversations,
      getViaLabel,
      loadConversationMessages,
    }),
    [
      activeAccount,
      conversations,
      filteredConversations,
      followUps,
      getViaLabel,
      knownAccounts,
      loading,
      loadConversationMessages,
      messages,
      refresh,
      refreshZernioSettings,
      searchQuery,
      selectedAccountId,
      setSelectedAccountId,
      syncing,
      triggerSync,
      zernioSettings,
    ],
  )

  return <CrmContext.Provider value={value}>{children}</CrmContext.Provider>
}

export function useCrm() {
  const context = useContext(CrmContext)
  if (!context) throw new Error('useCrm deve ser usado dentro de CrmProvider')
  return context
}
