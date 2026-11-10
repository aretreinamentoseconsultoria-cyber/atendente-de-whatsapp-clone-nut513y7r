import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppIcons } from '@/lib/icons'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ConversationLoadingState } from '@/components/inbox/ConversationLoadingState'
import FollowUpDialog from '@/components/FollowUpDialog'
import { useAuth } from '@/contexts/AuthContext'
import { useCrm } from '@/contexts/CrmContext'
import { fullDate, hoursSince, relativeTime, sanitizeDisplayName, shortDate } from '@/lib/format'
import { sendZernioMessage, listZernioTemplates, type WhatsAppTemplate } from '@/services/zernio'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { InboxSidebar } from '@/components/inbox/InboxSidebar'
import { ZernioLogo, ZERNIO_REFERRAL_URL } from '@/components/ZernioLogo'
import pb from '@/lib/pocketbase/client'
import {
  normalizeNameForMatch,
  normalizePhoneForMatch,
  parseSharedContact,
} from '@/lib/contactCard'
import { SharedContactCard } from '@/components/inbox/SharedContactCard'
import { AudioPlayer } from '@/components/inbox/AudioPlayer'
import { DocumentCard } from '@/components/inbox/DocumentCard'
import { ImageMessage } from '@/components/inbox/ImageMessage'
import { ShinyText } from '@/components/reactbits/ShinyText'
import { AnimatedListItem } from '@/components/reactbits/AnimatedListItem'
import type { Conversation } from '@/types/crm'

type Queue = 'responder' | 'followups' | 'madrugada' | 'acompanhamento' | 'todas'

interface StoredLayout {
  sidebarOpen: boolean
  intelOpen: boolean
}

const getInboxLayoutKey = (userId?: string) =>
  userId ? `fernand_inbox_column_layout_${userId}` : 'fernand_inbox_layout_guest'

function getInitialLayout(userId?: string): StoredLayout {
  if (typeof window === 'undefined') {
    return { sidebarOpen: true, intelOpen: true }
  }
  try {
    const key = getInboxLayoutKey(userId)
    const raw = localStorage.getItem(key)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredLayout>
      return {
        sidebarOpen: typeof parsed.sidebarOpen === 'boolean' ? parsed.sidebarOpen : true,
        intelOpen: typeof parsed.intelOpen === 'boolean' ? parsed.intelOpen : true,
      }
    }
  } catch {
    // fallback
  }
  return { sidebarOpen: true, intelOpen: true }
}

export default function Inbox() {
  const {
    conversations,
    messages,
    followUps,
    loading,
    markResponded,
    zernioSettings,
    refresh,
    searchQuery,
    setSearchQuery,
    syncing,
    triggerSync,
    selectedAccountId,
    setSelectedAccountId,
    knownAccounts,
    activeAccount,
    getViaLabel,
    loadConversationMessages,
  } = useCrm()
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  // Layout responsivo com persistência em localStorage escopado por usuário
  const [layout, setLayout] = useState<StoredLayout>(() => getInitialLayout(user?.id))
  const [sidebarPeeking, setSidebarPeeking] = useState(false)
  const [intelPeeking, setIntelPeeking] = useState(false)
  const sidebarHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intelHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Mobile drawer / navigation view
  const [mobileView, setMobileView] = useState<'list' | 'thread'>('list')

  // Ouve evento disparado pelo MobileNav ao tocar na aba 'Inbox' para retornar à lista se estiver na conversa
  useEffect(() => {
    const handleMobileNav = (e: Event) => {
      const customEvent = e as CustomEvent<{ to?: string }>
      if (customEvent.detail?.to === '/inbox') {
        setMobileView('list')
      }
    }
    window.addEventListener('mobilenav:navigate', handleMobileNav)
    return () => window.removeEventListener('mobilenav:navigate', handleMobileNav)
  }, [])

  // Ref para rolagem da thread de mensagens e rastreamento da conversa ativa
  const messagesScrollRef = useRef<HTMLDivElement>(null)
  const prevSelectedIdRef = useRef<string | null>(null)
  const prevMessagesCountRef = useRef<number>(0)
  const isNearBottomRef = useRef<boolean>(true)

  const [queue, setQueue] = useState<Queue>('responder')
  const [selectedId, setSelectedId] = useState('')
  // Dicionário de rascunhos isolados por conversa (conversationId -> draft) para não vazar entre conversas
  const [draftsByConversation, setDraftsByConversation] = useState<Record<string, string>>({})
  const [generatingConvId, setGeneratingConvId] = useState<string | null>(null)
  const [loadingThread, setLoadingThread] = useState(false)
  const [threadLoadError, setThreadLoadError] = useState<string | null>(null)
  const [retryingThread, setRetryingThread] = useState(false)
  const [followOpen, setFollowOpen] = useState(false)
  const [sendingZernio, setSendingZernio] = useState(false)

  // Templates da Meta para envio fora da janela de 24h
  const [approvedTemplates, setApprovedTemplates] = useState<WhatsAppTemplate[]>([])
  const [loadingApprovedTemplates, setLoadingApprovedTemplates] = useState(false)
  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplate | null>(null)
  const [templateVarValues, setTemplateVarValues] = useState<Record<string, string>>({})
  const [sendingTemplate, setSendingTemplate] = useState(false)

  // Seletor de perfis no topo do rail
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement>(null)

  // Bottom Sheet para troca de fila/prioridade no mobile
  const [queueSheetOpen, setQueueSheetOpen] = useState(false)

  // Sincroniza layout ao trocar de usuário
  useEffect(() => {
    setLayout(getInitialLayout(user?.id))
  }, [user?.id])

  // Fecha os menus ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false)
      }
    }
    if (profileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [profileMenuOpen])

  // Salvar no localStorage sempre que o layout fixo mudar
  useEffect(() => {
    try {
      const key = getInboxLayoutKey(user?.id)
      localStorage.setItem(key, JSON.stringify(layout))
    } catch {
      // ignore
    }
  }, [layout, user?.id])

  const toggleSidebar = () => {
    setLayout((prev) => ({ ...prev, sidebarOpen: !prev.sidebarOpen }))
    setSidebarPeeking(false)
  }

  const toggleIntel = () => {
    setLayout((prev) => ({ ...prev, intelOpen: !prev.intelOpen }))
    setIntelPeeking(false)
  }

  const expandIntel = () => {
    setLayout((prev) => ({ ...prev, intelOpen: true }))
    setIntelPeeking(false)
  }

  // Hover peek handlers com debounce leve para evitar piscadas
  const handleSidebarMouseEnter = () => {
    if (layout.sidebarOpen) return
    if (sidebarHoverTimer.current) clearTimeout(sidebarHoverTimer.current)
    sidebarHoverTimer.current = setTimeout(() => {
      setSidebarPeeking(true)
    }, 120)
  }

  const handleSidebarMouseLeave = () => {
    if (sidebarHoverTimer.current) clearTimeout(sidebarHoverTimer.current)
    sidebarHoverTimer.current = setTimeout(() => {
      setSidebarPeeking(false)
    }, 150)
  }

  const handleIntelMouseEnter = () => {
    if (layout.intelOpen) return
    if (intelHoverTimer.current) clearTimeout(intelHoverTimer.current)
    intelHoverTimer.current = setTimeout(() => {
      setIntelPeeking(true)
    }, 120)
  }

  const handleIntelMouseLeave = () => {
    if (intelHoverTimer.current) clearTimeout(intelHoverTimer.current)
    intelHoverTimer.current = setTimeout(() => {
      setIntelPeeking(false)
    }, 150)
  }

  const accountFilteredConversations = useMemo(() => {
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

  const pendingFollowUps = followUps.filter((item) => !item.done)
  const counts = {
    responder: accountFilteredConversations.filter(
      (item) => item.status === 'sem_resposta' && item.last_direction === 'in',
    ).length,
    followups: accountFilteredConversations.filter((item) =>
      pendingFollowUps.some((follow) => follow.conversation === item.id),
    ).length,
    madrugada: accountFilteredConversations.filter((item) => item.status === 'madrugada').length,
    acompanhamento: accountFilteredConversations.filter(
      (item) =>
        item.status === 'acompanhamento' ||
        item.status === 'respondida' ||
        item.last_direction === 'out',
    ).length,
    todas: accountFilteredConversations.length,
  }

  const filtered = useMemo(() => {
    let list = accountFilteredConversations
    if (queue === 'responder') {
      list = list.filter((item) => item.status === 'sem_resposta' && item.last_direction === 'in')
    } else if (queue === 'followups') {
      return list
        .filter((item) => pendingFollowUps.some((follow) => follow.conversation === item.id))
        .sort((a, b) => {
          const dueA = pendingFollowUps.find((f) => f.conversation === a.id)?.due_at || ''
          const dueB = pendingFollowUps.find((f) => f.conversation === b.id)?.due_at || ''
          return dueA.localeCompare(dueB)
        })
    } else if (queue === 'madrugada') {
      list = list.filter((item) => item.status === 'madrugada')
    } else if (queue === 'acompanhamento') {
      list = list.filter(
        (item) =>
          item.status === 'acompanhamento' ||
          item.status === 'respondida' ||
          item.last_direction === 'out',
      )
    }

    return [...list].sort((a, b) => {
      const timeA = new Date(a.last_message_at || a.updated || a.created).getTime() || 0
      const timeB = new Date(b.last_message_at || b.updated || b.created).getTime() || 0
      return timeB - timeA
    })
  }, [accountFilteredConversations, pendingFollowUps, queue])

  const selected =
    conversations.find((item) => item.id === selectedId) || filtered[0] || conversations[0]

  // Carregamento reativo sob demanda de mensagens ao selecionar ou trocar de conversa
  // NOTA: não incluir `messages` na lista de dependências para não disparar em loop infinito
  const prevLoadedConvIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!selected?.id) return
    if (prevLoadedConvIdRef.current === selected.id) return
    prevLoadedConvIdRef.current = selected.id

    let active = true
    const fetchDirect = async () => {
      // Se não temos mensagens em memória para essa conversa, sinalizamos carregamento
      const hasLocalMsgs = messages.some((m) => m.conversation === selected.id)
      if (!hasLocalMsgs) {
        setLoadingThread(true)
      }
      setThreadLoadError(null)
      try {
        const result = await loadConversationMessages(selected.id)
        if (active && result?.error && (!result.messages || result.messages.length === 0)) {
          setThreadLoadError(result.error)
        }
      } catch (err: unknown) {
        if (active) {
          setThreadLoadError(
            err instanceof Error ? err.message : 'Falha ao carregar histórico da conversa.',
          )
        }
      } finally {
        if (active) {
          setLoadingThread(false)
        }
      }
    }
    void fetchDirect()
    return () => {
      active = false
    }
  }, [selected?.id, loadConversationMessages])

  const handleRetryLoadThread = async () => {
    if (!selected?.id) return
    setRetryingThread(true)
    setThreadLoadError(null)
    setLoadingThread(true)
    try {
      const result = await loadConversationMessages(selected.id)
      if (result?.error && (!result.messages || result.messages.length === 0)) {
        setThreadLoadError(result.error)
      } else {
        toast.success('Histórico sincronizado com sucesso!')
      }
    } catch (err: unknown) {
      setThreadLoadError(
        err instanceof Error ? err.message : 'Falha ao sincronizar histórico da conversa.',
      )
    } finally {
      setLoadingThread(false)
      setRetryingThread(false)
    }
  }

  const thread = useMemo(() => {
    if (!selected) return []
    const rawList = messages
      .filter((item) => item.conversation === selected.id)
      .sort((a, b) => {
        const timeA = new Date(a.sent_at || a.created).getTime() || 0
        const timeB = new Date(b.sent_at || b.created).getTime() || 0
        if (timeA !== timeB) return timeA - timeB
        return (a.created || '').localeCompare(b.created || '')
      })

    // Deduplicação defensiva na renderização da thread:
    // 1. Pelo ID único do registro
    // 2. Por zernio_id idêntico
    // 3. Por conversa + direção + corpo com intervalo de até 60s
    const deduped: typeof rawList = []
    const seenIds = new Set<string>()
    const seenZernioIds = new Set<string>()

    for (const msg of rawList) {
      if (seenIds.has(msg.id)) continue
      if (msg.zernio_id && seenZernioIds.has(msg.zernio_id)) continue

      const msgTime = new Date(msg.sent_at || msg.created).getTime()
      const isSemanticDuplicate = deduped.some((existing) => {
        if (existing.direction !== msg.direction) return false
        if ((existing.body || '').trim() !== (msg.body || '').trim()) return false
        const exTime = new Date(existing.sent_at || existing.created).getTime()
        return Math.abs(msgTime - exTime) <= 60000
      })

      if (isSemanticDuplicate) continue

      seenIds.add(msg.id)
      if (msg.zernio_id) {
        seenZernioIds.add(msg.zernio_id)
      }
      deduped.push(msg)
    }

    return deduped
  }, [messages, selected])

  // Rola para o fim da thread de mensagens
  const scrollToBottom = useCallback((instant = true) => {
    const el = messagesScrollRef.current
    if (!el) return
    if (instant) {
      el.scrollTop = el.scrollHeight
    } else {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }
  }, [])

  // Atualiza isNearBottomRef ao rolar manualmente
  const handleMessagesScroll = useCallback(() => {
    const el = messagesScrollRef.current
    if (!el) return
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    isNearBottomRef.current = distanceToBottom < 100
  }, [])

  // Auto-scroll ao trocar de conversa ou abrir inicial: rolar direto pro fim
  useEffect(() => {
    if (!selected) return
    const currentId = selected.id
    const isNewConversation = prevSelectedIdRef.current !== currentId

    if (isNewConversation) {
      prevSelectedIdRef.current = currentId
      prevMessagesCountRef.current = thread.length
      isNearBottomRef.current = true

      // Executa imediatamente e no frame seguinte para garantir que o DOM já montou a lista de mensagens
      scrollToBottom(true)
      const frameId = requestAnimationFrame(() => {
        scrollToBottom(true)
        // Segundo frame de garantia caso a altura mude após estilização/imagens montarem
        requestAnimationFrame(() => {
          scrollToBottom(true)
        })
      })

      return () => cancelAnimationFrame(frameId)
    }

    // Se é a mesma conversa, mas mensagens aumentaram (ex.: nova mensagem em tempo real via Zernio)
    const prevCount = prevMessagesCountRef.current
    const currentCount = thread.length
    prevMessagesCountRef.current = currentCount

    if (currentCount > prevCount) {
      // Se o usuário estava próximo do fim, mantém ancorado no fim
      if (isNearBottomRef.current) {
        scrollToBottom(true)
        const frameId = requestAnimationFrame(() => {
          scrollToBottom(true)
        })
        return () => cancelAnimationFrame(frameId)
      }
      // Se rolou para cima lendo histórico, NÃO arranca o scroll dele
    }
  }, [selected, thread.length, scrollToBottom])

  const selectedFollow = pendingFollowUps.find((item) => item.conversation === selected?.id)

  const activeConversationId = selected?.id || ''
  const draft = activeConversationId ? draftsByConversation[activeConversationId] || '' : ''
  const generating = Boolean(activeConversationId && generatingConvId === activeConversationId)

  const setConversationDraft = useCallback((convId: string, text: string) => {
    if (!convId) return
    setDraftsByConversation((prev) => {
      if (!text) {
        if (!(convId in prev)) return prev
        const next = { ...prev }
        delete next[convId]
        return next
      }
      if (prev[convId] === text) return prev
      return { ...prev, [convId]: text }
    })
  }, [])

  const firstName = selected ? displayName(selected.name, selected.phone).split(' ')[0] : ''
  const suggested = selected
    ? `Oi, ${firstName}! Obrigado por compartilhar isso. ${selected.next_action || 'Vou verificar os detalhes e já te retorno com o próximo passo.'}`
    : ''
  const lastInboundMsg = useMemo(() => {
    if (!thread.length) return null
    const inbounds = thread.filter((m) => m.direction === 'in')
    if (!inbounds.length) return null
    return inbounds[inbounds.length - 1]
  }, [thread])

  const hoursSinceLastInbound = useMemo(() => {
    const refDate =
      lastInboundMsg?.sent_at ||
      (selected?.last_direction === 'in' ? selected?.last_message_at : null)
    if (!refDate) return 999
    const diff = (Date.now() - new Date(refDate).getTime()) / (1000 * 60 * 60)
    return Math.max(0, diff)
  }, [lastInboundMsg, selected])

  const isWithin24h = hoursSinceLastInbound <= 24
  const canSendViaZernio =
    zernioSettings?.operation_mode === 'read_write' &&
    zernioSettings?.is_connected &&
    Boolean(selected)

  const handleSuggest = () => {
    // Expande o painel lateral de inteligência se fechado
    expandIntel()
    if (!activeConversationId || generatingConvId === activeConversationId) return
    const targetConvId = activeConversationId
    const textToSet = suggested
    setGeneratingConvId(targetConvId)
    setTimeout(() => {
      setConversationDraft(targetConvId, textToSet)
      setGeneratingConvId((current) => (current === targetConvId ? null : current))
    }, 600)
  }

  const handleOpenFollowUp = () => {
    expandIntel()
    setFollowOpen(true)
  }

  const copyDraft = async () => {
    await navigator.clipboard.writeText(draft || suggested)
    toast.success('Rascunho copiado. Cole no WhatsApp para enviar.')
  }

  const respond = async () => {
    if (!selected) return
    const convId = selected.id
    try {
      await markResponded(convId)
      setConversationDraft(convId, '')
    } catch {
      // feedback tratado
    }
  }

  const handleSendViaZernio = async () => {
    if (!selected) return
    const convId = selected.id
    const textToSend = (draft || suggested).trim()
    if (!textToSend) {
      toast.error('O rascunho está vazio.')
      return
    }

    if (!isWithin24h) {
      toast.error('A janela de 24 horas da Meta expirou para esta conversa. Envio bloqueado.')
      return
    }

    setSendingZernio(true)
    try {
      const res = await sendZernioMessage(convId, textToSend)
      if (res.success) {
        toast.success('Mensagem enviada com sucesso pela Zernio!')
        setConversationDraft(convId, '')
        await refresh()
      } else {
        toast.error(`Falha no envio: ${res.message}`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao despachar mensagem pela Zernio.'
      toast.error(msg)
    } finally {
      setSendingZernio(false)
    }
  }

  // Carregar templates aprovados para permitir envio fora da janela de 24h
  useEffect(() => {
    let mounted = true
    async function loadTemplates() {
      if (zernioSettings?.operation_mode !== 'read_write') return
      setLoadingApprovedTemplates(true)
      try {
        const list = await listZernioTemplates()
        if (mounted) {
          const approved = list.filter((t) => (t.status || '').toUpperCase() === 'APPROVED')
          setApprovedTemplates(approved)
          if (approved.length > 0 && !selectedTemplate) {
            setSelectedTemplate(approved[0])
          }
        }
      } catch (err) {
        console.warn('Erro ao carregar templates aprovados:', err)
      } finally {
        if (mounted) setLoadingApprovedTemplates(false)
      }
    }
    void loadTemplates()
    return () => {
      mounted = false
    }
  }, [zernioSettings?.operation_mode])

  // Identificar variáveis {{1}}, {{2}}... no template selecionado
  const getTemplateVariables = (tpl: WhatsAppTemplate | null): string[] => {
    if (!tpl) return []
    const bodyComp = tpl.components?.find((c) => (c.type || '').toUpperCase() === 'BODY')
    const text = bodyComp?.text || tpl.body || ''
    const matches = text.match(/\{\{([0-9a-zA-Z_]+)\}\}/g) || []
    const vars = matches.map((m) => m.replace(/[{}]/g, ''))
    return Array.from(new Set(vars))
  }
  const handleOpenTemplateModal = () => {
    if (approvedTemplates.length === 0) {
      toast.info('Nenhum template aprovado na Meta. Crie um template em Configurações > Templates.')
      return
    }
    const tpl = selectedTemplate || approvedTemplates[0]
    setSelectedTemplate(tpl)
    const vars = getTemplateVariables(tpl)
    const initialVars: Record<string, string> = {}
    vars.forEach((v) => {
      // Se tiver nome do contato, pré-preencher {{1}} se parecer nome
      if (v === '1' && selected?.name) {
        initialVars[v] = selected.name.split(' ')[0]
      } else {
        initialVars[v] = ''
      }
    })
    setTemplateVarValues(initialVars)
    setTemplateModalOpen(true)
  }

  const handleSendTemplateMessage = async () => {
    if (!selected || !selectedTemplate) return
    const convId = selected.id

    // Validar preenchimento das variáveis
    const vars = getTemplateVariables(selectedTemplate)
    for (const v of vars) {
      if (!templateVarValues[v] || !templateVarValues[v].trim()) {
        toast.error(`Preencha o valor da variável {{${v}}}.`)
        return
      }
    }

    setSendingTemplate(true)
    try {
      // Montar texto final renderizado para salvar e exibir
      let renderedText =
        selectedTemplate.components?.find((c) => (c.type || '').toUpperCase() === 'BODY')?.text ||
        selectedTemplate.body ||
        `[Template: ${selectedTemplate.name}]`
      vars.forEach((v) => {
        renderedText = renderedText.replaceAll(`{{${v}}}`, templateVarValues[v] || '')
      })

      const res = await sendZernioMessage(convId, renderedText, {
        templateName: selectedTemplate.name,
        templateLanguage: selectedTemplate.language || 'pt_BR',
        templateVariables: templateVarValues,
      })

      if (res.success) {
        toast.success(`Template "${selectedTemplate.name}" enviado com sucesso!`)
        setTemplateModalOpen(false)
        await refresh()
      } else {
        toast.error(`Falha no envio do template: ${res.message}`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao enviar template via Zernio.'
      toast.error(msg)
    } finally {
      setSendingTemplate(false)
    }
  }

  const handleSync = async () => {
    await triggerSync()
  }

  const handleSelectConversation = (id: string) => {
    setSelectedId(id)
    setMobileView('thread')
  }

  const handleOpenContactConversation = async (contactName: string, contactPhone?: string) => {
    const normTargetPhone = normalizePhoneForMatch(contactPhone)
    const normTargetName = normalizeNameForMatch(contactName)

    // Helper para comparar telefone normalizado (exato ou sufixos de 8 e 9 dígitos)
    const matchPhone = (phoneCandidate?: string | null) => {
      if (!normTargetPhone) return false
      const cPhone = normalizePhoneForMatch(phoneCandidate)
      if (!cPhone) return false
      if (cPhone === normTargetPhone) return true
      if (normTargetPhone.length >= 8 && cPhone.length >= 8) {
        const targetLast8 = normTargetPhone.slice(-8)
        const targetLast9 = normTargetPhone.slice(-9)
        const cLast8 = cPhone.slice(-8)
        const cLast9 = cPhone.slice(-9)
        if (cLast8 === targetLast8) return true
        if (normTargetPhone.length >= 9 && cPhone.length >= 9 && cLast9 === targetLast9) return true
      }
      return false
    }

    // Helper para comparar nome normalizado (exato ou inclusão segura de pelo menos 4 caracteres)
    const matchName = (nameCandidate?: string | null) => {
      if (!normTargetName) return false
      const cName = normalizeNameForMatch(nameCandidate)
      if (!cName) return false
      if (cName === normTargetName) return true
      if (
        normTargetName.length >= 4 &&
        (cName.includes(normTargetName) || normTargetName.includes(cName))
      ) {
        return true
      }
      return false
    }

    // (a) Matching contra as conversas em memória (conversations do useCrm)
    if (normTargetPhone) {
      const phoneMatches = conversations
        .filter((c) => matchPhone(c.phone))
        .sort(
          (a, b) =>
            new Date(b.last_message_at || b.created).getTime() -
            new Date(a.last_message_at || a.created).getTime(),
        )

      if (phoneMatches.length > 0) {
        const targetConv = phoneMatches[0]
        handleSelectConversation(targetConv.id)
        toast.success(`Abrindo conversa com ${displayName(targetConv.name, targetConv.phone)}`)
        return
      }
    }

    if (normTargetName) {
      const nameMatches = conversations
        .filter((c) => matchName(c.name))
        .sort(
          (a, b) =>
            new Date(b.last_message_at || b.created).getTime() -
            new Date(a.last_message_at || a.created).getTime(),
        )

      if (nameMatches.length > 0) {
        const targetConv = nameMatches[0]
        handleSelectConversation(targetConv.id)
        toast.success(`Abrindo conversa com ${displayName(targetConv.name, targetConv.phone)}`)
        return
      }
    }

    // (b) Sem match em memória, buscar diretamente no PocketBase com multi-tenancy estrito
    const currentUserId = user?.id || pb.authStore.record?.id
    if (currentUserId) {
      try {
        const filterParts: string[] = [`user = "${currentUserId}"`]

        // Cláusulas de telefone e nome para query no PocketBase
        const queryTerms: string[] = []
        if (normTargetPhone) {
          const rawDigits = contactPhone?.replace(/\D/g, '') || ''
          const last8 = rawDigits.slice(-8)
          if (last8) queryTerms.push(`phone ~ "${last8}"`)
          if (normTargetPhone) queryTerms.push(`phone ~ "${normTargetPhone}"`)
        }
        if (normTargetName) {
          // Usar as primeiras palavras significativas do nome
          const words = normTargetName.split(' ').filter((w) => w.length >= 3)
          if (words.length > 0) {
            queryTerms.push(`name ~ "${words[0]}"`)
          } else if (normTargetName.length >= 3) {
            queryTerms.push(`name ~ "${normTargetName}"`)
          }
        }

        if (queryTerms.length > 0) {
          filterParts.push(`(${queryTerms.join(' || ')})`)
          const pbFilter = filterParts.join(' && ')

          const result = await pb.collection<Conversation>('conversations').getList(1, 10, {
            filter: pbFilter,
            sort: '-last_message_at',
          })

          if (result.items.length > 0) {
            // (c) Escolher a mais recente e verificar matching seguro
            let matched = result.items.find((c) => matchPhone(c.phone) || matchName(c.name))
            if (!matched && result.items.length > 0) {
              matched = result.items[0]
            }

            if (matched) {
              // (d) Achou → abrir/centralizar a conversa
              handleSelectConversation(matched.id)
              toast.success(`Abrindo conversa com ${displayName(matched.name, matched.phone)}`)
              return
            }
          }
        }
      } catch (err) {
        console.warn('Erro ao consultar conversa remota no PocketBase:', err)
      }
    }

    // (e) Sem conversa mas com telefone → abrir wa.me em nova aba com fallback
    if (normTargetPhone) {
      const waUrl = `https://wa.me/${normTargetPhone}`
      window.open(waUrl, '_blank', 'noopener,noreferrer')
      toast.info('Nenhuma conversa interna encontrada. Abrindo contato no WhatsApp oficial.')
      return
    }

    // (f) Sem telefone → copiar o nome + toast explicando
    if (contactName) {
      try {
        await navigator.clipboard.writeText(contactName)
        toast.info(
          `Contato "${contactName}" não possui telefone cadastrado. O nome foi copiado para a área de transferência.`,
        )
      } catch {
        toast.info(`Contato "${contactName}" não possui telefone para abrir conversa.`)
      }
    }
  }

  const handleSelectQueue = (q: Queue) => {
    setQueue(q)
  }

  const isSidebarExpanded = layout.sidebarOpen || sidebarPeeking
  const isIntelExpanded = layout.intelOpen || intelPeeking

  return (
    <div className="h-full w-full overflow-hidden relative flex bg-slate-900">
      {/* Imagem de fundo azul-gelo da demo da landing sem overlay para presença total */}
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage:
            "url('https://res.cloudinary.com/dfrzlhyvi/image/upload/v1789769629/bg-exemplo-2-azul-gelo_bfo81i.png')",
        }}
        aria-hidden="true"
      />

      {/* ========================================================================= */}
      {/* 1. SIDEBAR DE FILAS (Componente reutilizável compartilhado com Settings)  */}
      {/* ========================================================================= */}
      <InboxSidebar
        currentQueue={queue}
        onSelectQueue={handleSelectQueue}
        sidebarOpen={layout.sidebarOpen}
        onToggleSidebar={toggleSidebar}
      />

      {/* ========================================================================= */}
      {/* 2. LISTA DE CONVERSAS (Coluna secundária com filtro por número/conta) */}
      {/* ========================================================================= */}
      <section
        className={`relative z-10 flex flex-col border-r border-[#CBD6D7]/80 backdrop-blur-md shrink-0 min-h-0 transition-colors ${
          queue === 'responder' ? 'bg-[#EBF7F0]/90 border-r-[#BFDEC9]' : 'bg-white/95'
        } ${
          mobileView === 'thread' ? 'hidden md:flex' : 'flex flex-1 md:flex-initial'
        } w-full md:w-[300px] lg:w-[320px] xl:w-[340px] 2xl:w-[360px]`}
        aria-label="Lista de conversas"
      >
        {/* Header da lista */}
        <div
          className={`flex h-12 md:h-14 shrink-0 items-center justify-between border-b px-3 sm:px-4 transition-colors ${
            queue === 'responder'
              ? 'border-[#BFDEC9] bg-transparent'
              : 'border-[#CBD6D7] bg-transparent'
          }`}
        >
          {/* Mobile: Título tocável com alvo de toque ≥44px para abrir seletor de fila */}
          <div className="md:hidden min-w-0 flex-1 -ml-1">
            <button
              type="button"
              onClick={() => setQueueSheetOpen(true)}
              className="flex items-center gap-1.5 min-h-[44px] py-1 px-1 rounded-xl text-left hover:bg-black/[0.03] active:scale-[0.98] transition-all touch-manipulation max-w-full"
              aria-label="Trocar fila ou prioridade"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <strong className="text-xs font-bold text-[#353B47] uppercase tracking-wide truncate block">
                    {queue === 'responder'
                      ? 'Responder agora'
                      : queue === 'followups'
                        ? 'Follow-ups'
                        : queue === 'madrugada'
                          ? 'Mensagens da madrugada'
                          : queue === 'acompanhamento'
                            ? 'Em acompanhamento'
                            : 'Todas as conversas'}
                  </strong>
                  <AppIcons.chevronDown className="h-3.5 w-3.5 shrink-0 text-[#7A838E]" />
                </div>
                <p className="text-[10px] text-[#89919A] truncate">
                  {queue === 'responder'
                    ? 'Prioridade mais alta primeiro · Toque para trocar'
                    : 'Toque para trocar de fila'}
                </p>
              </div>
            </button>
          </div>

          {/* Desktop: Header estático */}
          <div className="hidden md:block min-w-0 flex-1">
            <strong className="text-xs font-bold text-[#353B47] uppercase tracking-wide truncate block">
              {queue === 'responder'
                ? 'Responder agora'
                : queue === 'followups'
                  ? 'Follow-ups'
                  : queue === 'madrugada'
                    ? 'Mensagens da madrugada'
                    : queue === 'acompanhamento'
                      ? 'Em acompanhamento'
                      : 'Todas as conversas'}
            </strong>
            <p className="text-[10px] text-[#89919A] truncate">Prioridade mais alta primeiro</p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Botão de filtro de fila no mobile para dar affordance extra explícita */}
            <Button
              variant="outline"
              size="icon"
              className="flex md:hidden h-8 w-8 min-h-[36px] min-w-[36px] rounded-lg border-[#CBD6D7] text-[#464B5F] hover:bg-white touch-manipulation"
              onClick={() => setQueueSheetOpen(true)}
              title="Trocar fila de atendimento"
              aria-label="Trocar fila de atendimento"
            >
              <AppIcons.filterQueue className="h-4 w-4 text-[#3B82F6]" />
            </Button>
            {zernioSettings?.is_connected && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 min-h-[36px] min-w-[36px] md:h-7 md:w-7 md:min-h-0 md:min-w-0 text-[#717C88] touch-manipulation"
                onClick={handleSync}
                disabled={syncing}
                title="Sincronizar com a Zernio"
                aria-label="Sincronizar com a Zernio"
              >
                <AppIcons.sync
                  className={`h-4 w-4 md:h-3.5 md:w-3.5 ${syncing ? 'animate-spin' : ''}`}
                />
              </Button>
            )}
            <span className="rounded-full bg-[#F0F4F3] px-2 py-0.5 text-[10px] tabular-nums font-semibold text-[#464B5F]">
              {filtered.length}
            </span>
          </div>
        </div>

        {/* Banner discreto do perfil ativo quando filtrado por número (com botão rápido de desmarcar) */}
        {activeAccount && (
          <div className="shrink-0 flex items-center justify-between border-b border-[#E4C8CF] bg-[#FDF4F6] px-3 py-1.5 text-xs text-[#7B2D3B]">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: activeAccount.color }}
              />
              <span className="truncate font-semibold text-[11px]">
                Filtrado por: {activeAccount.name} ({activeAccount.phone})
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedAccountId('all')}
              className="ml-2 text-[10px] font-medium underline hover:text-[#521C26] shrink-0"
              title="Voltar a ver todos os números"
            >
              Ver todos
            </button>
          </div>
        )}

        {/* Lista rolável de conversas */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-6 md:pb-2">
          <div className="p-2">
            {loading && !conversations.length ? (
              <ConversationLoadingState accountName={activeAccount?.name} className="py-10" />
            ) : (
              filtered.map((conversation) => (
                <AnimatedListItem key={conversation.id} id={conversation.id} layoutDuration={0.25}>
                  <ConversationCard
                    conversation={conversation}
                    active={selected?.id === conversation.id}
                    viaLabel={getViaLabel(conversation.zernio_account_id)}
                    followUp={pendingFollowUps.find(
                      (item) => item.conversation === conversation.id,
                    )}
                    onClick={() => handleSelectConversation(conversation.id)}
                  />
                </AnimatedListItem>
              ))
            )}
            {!loading && !filtered.length && (
              <div className="p-8 text-center">
                <AppIcons.checkCircle className="mx-auto mb-3 h-7 w-7 text-[#68A087]" />
                <p className="text-sm font-semibold text-[#464B5F]">Fila em dia</p>
                <p className="mt-1 text-xs text-[#8A929C]">Nenhuma conversa nesta seção.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3 e 4. ÁREA CENTRAL (THREAD ATIVA + PAINEL DE INTELIGÊNCIA COLAPSÁVEL)    */}
      {/* ========================================================================= */}
      <div
        className={`relative z-10 flex-1 min-w-0 min-h-0 flex overflow-hidden ${
          mobileView === 'list' ? 'hidden md:flex' : 'flex'
        }`}
      >
        {selected ? (
          <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden bg-white/40">
            {/* Header da conversa ativa */}
            <header className="flex h-12 sm:h-14 shrink-0 items-center gap-2 sm:gap-3 border-b border-[#CBD6D7]/80 bg-white/95 backdrop-blur-md px-3 sm:px-4">
              {/* Botão voltar no mobile com alvo de toque ≥44px */}
              <button
                type="button"
                onClick={() => setMobileView('list')}
                className="flex md:hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#464B5F] hover:bg-[#F0F4F3] border border-[#CBD6D7]/70 active:scale-95 touch-manipulation transition-all"
                aria-label="Voltar para a lista de conversas"
                title="Voltar para a lista"
              >
                <AppIcons.arrowLeft className="h-5 w-5" />
              </button>

              <AvatarWithFallback
                name={displayName(selected.name, selected.phone)}
                avatarUrl={selected.avatar_url}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h2 className="truncate text-xs sm:text-sm font-bold text-[#353B47]">
                    {displayName(selected.name, selected.phone)}
                  </h2>
                </div>
                <p className="text-[10px] text-[#818995] truncate">
                  {formatPhone(selected.phone)}
                  <span className="hidden xs:inline">
                    {' · '}
                    {selected.temperature === 'quente'
                      ? 'Lead quente'
                      : selected.temperature === 'morno'
                        ? 'Lead morno'
                        : 'Lead frio'}
                  </span>
                </p>
              </div>

              {/* Ações do header */}
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenFollowUp}
                  className="hidden sm:flex border-[#CBD6D7] text-xs h-8 hover:bg-[#F8FAFA]"
                >
                  <AppIcons.queueFollowUps className="mr-1.5 h-3.5 w-3.5 text-[#F97316]" />
                  Criar follow-up
                </Button>
                {/* Botão compacto de follow-up no mobile */}
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleOpenFollowUp}
                  className="flex sm:hidden h-9 w-9 min-h-[36px] min-w-[36px] border-[#CBD6D7] text-[#F97316] hover:bg-[#F8FAFA] touch-manipulation"
                  title="Criar follow-up"
                  aria-label="Criar follow-up"
                >
                  <AppIcons.queueFollowUps className="h-4 w-4 text-[#F97316]" />
                </Button>
                <Button
                  size="sm"
                  disabled={generating}
                  onClick={handleSuggest}
                  className="bg-[#464B5F] text-xs hover:bg-[#373C4F] disabled:opacity-80 h-9 sm:h-8 px-2.5 sm:px-3 touch-manipulation font-medium"
                >
                  {generating ? (
                    <>
                      <AppIcons.aiSparkle className="mr-1.5 h-3.5 w-3.5 animate-spin text-[#E5A14C]" />
                      <ShinyText text="Gerando…" color="#CBD6D7" shineColor="#FFFFFF" speed={1.8} />
                    </>
                  ) : (
                    <>
                      <AppIcons.aiSparkle className="mr-1.5 h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Sugerir resposta</span>
                      <span className="sm:hidden text-xs">Sugerir</span>
                    </>
                  )}
                </Button>
              </div>
            </header>

            {/* Conteúdo principal: Thread + Painel lateral de inteligência */}
            <div className="flex-1 min-h-0 flex overflow-hidden">
              {/* Coluna da thread de mensagens */}
              <div className="flex-1 min-w-0 min-h-0 flex flex-col border-r border-[#CBD6D7]/80 overflow-hidden bg-transparent">
                {/* Janela de 24h Meta Status Banner (quando em modo envio) */}
                {zernioSettings?.operation_mode === 'read_write' && (
                  <div
                    className={`shrink-0 flex items-center justify-between border-b px-4 py-2 text-[11px] ${
                      isWithin24h
                        ? 'border-[#C8E5D8] bg-[#F2FAF6] text-[#295F4D]'
                        : 'border-[#E8D4D0] bg-[#FFF5F3] text-[#A24840]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isWithin24h ? (
                        <AppIcons.shieldSafe className="h-3.5 w-3.5 text-[#3FB980]" />
                      ) : (
                        <AppIcons.shieldAlert className="h-3.5 w-3.5 text-[#D1655A]" />
                      )}
                      <span>
                        {isWithin24h
                          ? `Janela Meta 24h aberta (última mensagem do lead há ${Math.round(hoursSinceLastInbound * 10) / 10}h)`
                          : `Janela Meta 24h fechada (última mensagem do lead há ${Math.round(hoursSinceLastInbound * 10) / 10}h)`}
                      </span>
                    </div>
                    {!isWithin24h && (
                      <span className="font-semibold text-[10px]">Exige template aprovado</span>
                    )}
                  </div>
                )}

                {/* THREAD DE MENSAGENS COM ROLAGEM CORRETA E LARGURA DE LEITURA ÓTIMA */}
                <div
                  ref={messagesScrollRef}
                  onScroll={handleMessagesScroll}
                  className="flex-1 min-h-0 overflow-y-auto overscroll-contain bg-white/45 backdrop-blur-xs"
                >
                  <div className="mx-auto w-full max-w-[760px] 2xl:max-w-[820px] space-y-3 px-2 sm:px-6 py-3 sm:py-5 lg:px-8">
                    {loadingThread && thread.length === 0 ? (
                      <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-[#8F98A3]">
                        <AppIcons.spinner className="h-4 w-4 animate-spin text-[#4EBE73]" />
                        <span>Carregando mensagens da conversa...</span>
                      </div>
                    ) : thread.length === 0 ? (
                      <div className="py-8 px-2 sm:px-4 flex flex-col items-center justify-center text-center">
                        {threadLoadError ? (
                          <div className="w-full max-w-md rounded-xl border border-[#F0C9C5] bg-[#FFF5F4] p-4 text-xs text-[#A24840] shadow-xs">
                            <div className="flex items-center justify-center gap-2 font-semibold">
                              <AppIcons.shieldAlert className="h-4 w-4 text-[#D1655A]" />
                              <span>Não foi possível carregar o histórico na Zernio</span>
                            </div>
                            <p className="mt-1.5 text-[11px] text-[#7B2D3B] leading-relaxed break-words">
                              {threadLoadError}
                            </p>
                            <div className="mt-3 flex items-center justify-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void handleRetryLoadThread()}
                                disabled={retryingThread}
                                className="min-h-[36px] sm:h-7 text-xs sm:text-[11px] border-[#E3B2AD] bg-white text-[#A24840] hover:bg-[#FDF0EE] touch-manipulation"
                              >
                                {retryingThread ? (
                                  <>
                                    <AppIcons.spinner className="mr-1.5 h-3 w-3 animate-spin" />
                                    Tentando novamente...
                                  </>
                                ) : (
                                  <>
                                    <AppIcons.sync className="mr-1.5 h-3 w-3" />
                                    Tentar buscar novamente
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        ) : selected?.summary && selected.summary !== 'Conversa iniciada' ? (
                          <div className="w-full max-w-md rounded-xl border border-[#DCE4E4] bg-white/80 p-3.5 sm:p-4 shadow-2xs">
                            <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#EEF2F2] text-[10px] uppercase tracking-wider font-semibold text-[#7D8895]">
                              <span>Última mensagem registrada</span>
                              <span>
                                {relativeTime(selected.last_message_at || selected.created)}
                              </span>
                            </div>
                            <div
                              className={`rounded-lg px-3 py-2 text-xs text-left leading-relaxed ${
                                selected.last_direction === 'out'
                                  ? 'border border-[#BFD9CF] bg-[#EAF7F1] text-[#334D41]'
                                  : 'border border-[#DDE4E4] bg-white text-[#464B5F]'
                              }`}
                            >
                              <p className="whitespace-pre-wrap break-words">{selected.summary}</p>
                              <span className="mt-1 block text-right text-[9px] text-[#9098A1]">
                                {selected.last_direction === 'out' ? 'Enviada' : 'Recebida'}
                              </span>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-2 text-[11px] text-[#848F9C]">
                              <span className="text-[10px] sm:text-[11px]">
                                Histórico aguardando sincronização.
                              </span>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => void handleRetryLoadThread()}
                                disabled={retryingThread}
                                className="h-7 text-[11px] text-[#3D745B] hover:text-[#2C8A55] hover:bg-[#EEF7F2] touch-manipulation"
                              >
                                {retryingThread ? (
                                  <>
                                    <AppIcons.spinner className="mr-1 h-3 w-3 animate-spin" />
                                    Buscando...
                                  </>
                                ) : (
                                  <>
                                    <AppIcons.sync className="mr-1 h-3 w-3" />
                                    Buscar da Zernio
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-[#8F98A3]">
                            <p>Nenhuma mensagem carregada nesta conversa.</p>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void handleRetryLoadThread()}
                              disabled={retryingThread}
                              className="mt-3 min-h-[36px] sm:h-7 text-xs border-[#CBD6D7] text-[#556372] touch-manipulation"
                            >
                              <AppIcons.sync className="mr-1.5 h-3.5 w-3.5" />
                              Buscar da Zernio
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : (
                      thread.map((message) => {
                        const isOut = message.direction === 'out'
                        const parsedContact = parseSharedContact(message.body)

                        return (
                          <div
                            key={message.id}
                            className={`flex items-end gap-1.5 sm:gap-2.5 ${isOut ? 'justify-end' : 'justify-start'}`}
                          >
                            {!isOut && (
                              <div className="mb-0.5 shrink-0">
                                <AvatarWithFallback
                                  name={displayName(selected.name, selected.phone)}
                                  avatarUrl={selected.avatar_url}
                                  size="xs"
                                />
                              </div>
                            )}
                            {parsedContact ? (
                              <div className="max-w-[96%] sm:max-w-[75%] md:max-w-[70%] lg:max-w-[560px]">
                                <SharedContactCard
                                  contact={parsedContact}
                                  isOutgoing={isOut}
                                  sentAt={message.sent_at}
                                  formattedTime={relativeTime(message.sent_at)}
                                  onOpenConversation={(contactName, contactPhone) =>
                                    handleOpenContactConversation(contactName, contactPhone)
                                  }
                                />
                              </div>
                            ) : message.media_type === 'audio' ||
                              Boolean(
                                message.media_url && message.body && message.body.includes('🎵'),
                              ) ? (
                              <div
                                className={`w-fit max-w-[96%] sm:max-w-[75%] md:max-w-[70%] lg:max-w-[560px] rounded-2xl border px-3 py-2 sm:px-3.5 sm:py-2.5 text-xs leading-relaxed shadow-2xs ${
                                  isOut
                                    ? 'border-[#BFD9CF] bg-[#EAF7F1] text-[#334D41]'
                                    : 'border-[#DDE4E4] bg-white text-[#464B5F]'
                                }`}
                              >
                                <AudioPlayer
                                  messageId={message.id}
                                  mediaUrl={message.media_url}
                                  transcription={message.transcription}
                                  direction={isOut ? 'out' : 'in'}
                                  durationLabel={
                                    message.body && !message.body.startsWith('🎵')
                                      ? message.body
                                      : undefined
                                  }
                                />
                                <span className="mt-1 block text-right text-[9px] text-[#9098A1]">
                                  {relativeTime(message.sent_at)}
                                </span>
                              </div>
                            ) : message.media_type === 'file' ||
                              Boolean(
                                message.body && message.body.trim().toLowerCase().endsWith('.pdf'),
                              ) ? (
                              <div
                                className={`w-fit max-w-[96%] sm:max-w-[75%] md:max-w-[70%] lg:max-w-[560px] rounded-2xl border px-3 py-2 sm:px-3.5 sm:py-2.5 text-xs leading-relaxed shadow-2xs ${
                                  isOut
                                    ? 'border-[#BFD9CF] bg-[#EAF7F1] text-[#334D41]'
                                    : 'border-[#DDE4E4] bg-white text-[#464B5F]'
                                }`}
                              >
                                <DocumentCard
                                  messageId={message.id}
                                  mediaUrl={message.media_url}
                                  fileName={message.body}
                                  direction={isOut ? 'out' : 'in'}
                                />
                                <span className="mt-1 block text-right text-[9px] text-[#9098A1]">
                                  {relativeTime(message.sent_at)}
                                </span>
                              </div>
                            ) : message.media_type === 'image' ? (
                              <div
                                className={`w-fit max-w-[96%] sm:max-w-[75%] md:max-w-[70%] lg:max-w-[560px] rounded-2xl border px-2.5 py-2 sm:px-3 text-xs leading-relaxed shadow-2xs ${
                                  isOut
                                    ? 'border-[#BFD9CF] bg-[#EAF7F1] text-[#334D41]'
                                    : 'border-[#DDE4E4] bg-white text-[#464B5F]'
                                }`}
                              >
                                <ImageMessage
                                  messageId={message.id}
                                  mediaUrl={message.media_url}
                                  caption={message.body}
                                  direction={isOut ? 'out' : 'in'}
                                />
                                <span className="mt-1 block text-right text-[9px] text-[#9098A1]">
                                  {relativeTime(message.sent_at)}
                                </span>
                              </div>
                            ) : (
                              <div
                                className={`w-fit max-w-[96%] sm:max-w-[75%] md:max-w-[70%] lg:max-w-[560px] rounded-2xl border px-3 sm:px-4 py-2 sm:py-2.5 text-xs leading-relaxed shadow-2xs ${
                                  isOut
                                    ? 'border-[#BFD9CF] bg-[#EAF7F1] text-[#334D41]'
                                    : 'border-[#DDE4E4] bg-white text-[#464B5F]'
                                }`}
                              >
                                <p className="whitespace-pre-wrap break-words">{message.body}</p>
                                <span className="mt-1 block text-right text-[9px] text-[#9098A1]">
                                  {relativeTime(message.sent_at)}
                                </span>
                              </div>
                            )}{' '}
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>

                {/* COMPOSER / RASCUNHO */}
                <div className="shrink-0 border-t border-[#CBD6D7]/80 bg-white/95 backdrop-blur-md p-2.5 sm:p-3 sm:px-4">
                  <div className="mx-auto w-full max-w-[760px] 2xl:max-w-[820px]">
                    {draft ? (
                      <div className="rounded-xl border border-[#AFCFC0] bg-[#F7FFFA] p-2.5 sm:p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#4F7564]">
                            <AppIcons.aiSparkle className="h-3.5 w-3.5" /> Rascunho preparado
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 md:h-7 min-h-[32px] px-2 text-xs md:text-[10px] text-[#7D8895] hover:text-[#A24840] touch-manipulation"
                            onClick={() => setConversationDraft(activeConversationId, '')}
                          >
                            Descartar
                          </Button>
                        </div>
                        <textarea
                          value={draft}
                          onChange={(event) =>
                            setConversationDraft(activeConversationId, event.target.value)
                          }
                          className="min-h-24 sm:min-h-20 w-full resize-none bg-transparent text-base md:text-xs leading-relaxed outline-none text-[#2C323E] placeholder:text-[#9AA1AA]"
                          placeholder="Escreva ou edite a mensagem..."
                        />
                        <div className="mt-2.5 flex flex-wrap items-center justify-end gap-2">
                          {/* Botão Copiar */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void copyDraft()}
                            className="min-h-[44px] sm:min-h-[36px] sm:h-8 border-[#CBD6D7] text-xs px-3 touch-manipulation active:scale-95"
                          >
                            <AppIcons.copy className="mr-1.5 h-4 w-4 sm:h-3.5 sm:w-3.5" />
                            Copiar
                          </Button>

                          {/* Botão Marcar como respondida */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void respond()}
                            className="min-h-[44px] sm:min-h-[36px] sm:h-8 border-[#CBD6D7] text-xs text-[#507564] hover:bg-[#F2F7F5] px-3 touch-manipulation active:scale-95"
                          >
                            <AppIcons.checkCircle className="mr-1.5 h-4 w-4 sm:h-3.5 sm:w-3.5 text-[#3FB980]" />
                            <span className="hidden xs:inline">Marcar como respondida</span>
                            <span className="xs:hidden">Respondida</span>
                          </Button>

                          {/* Botão "Enviar pela Zernio" — visível quando em modo "Leitura + envio" */}
                          {canSendViaZernio &&
                            (isWithin24h ? (
                              <Button
                                size="sm"
                                onClick={() => void handleSendViaZernio()}
                                disabled={sendingZernio}
                                className="min-h-[44px] sm:min-h-[36px] sm:h-8 bg-gradient-to-r from-[#4EBE73] to-[#45C29E] text-xs font-semibold text-white shadow-sm hover:opacity-95 px-3.5 touch-manipulation active:scale-95"
                              >
                                {sendingZernio ? (
                                  <>
                                    <AppIcons.spinner className="mr-1.5 h-4 w-4 sm:h-3.5 sm:w-3.5 animate-spin" />
                                    Enviando...
                                  </>
                                ) : (
                                  <>
                                    <AppIcons.send className="mr-1.5 h-4 w-4 sm:h-3.5 sm:w-3.5" />
                                    Enviar pela Zernio
                                  </>
                                )}
                              </Button>
                            ) : approvedTemplates.length > 0 ? (
                              <Button
                                size="sm"
                                onClick={handleOpenTemplateModal}
                                className="min-h-[44px] sm:min-h-[36px] sm:h-8 bg-gradient-to-r from-[#10B981] to-[#059669] text-xs font-semibold text-white shadow-xs hover:opacity-95 px-3 touch-manipulation active:scale-95"
                                title="Enviar mensagem via template aprovado pela Meta"
                              >
                                <AppIcons.template className="mr-1.5 h-4 w-4 sm:h-3.5 sm:w-3.5" />
                                Enviar por Template ({approvedTemplates.length})
                              </Button>
                            ) : (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span>
                                    <Button
                                      size="sm"
                                      disabled
                                      className="min-h-[44px] sm:min-h-[36px] sm:h-8 cursor-not-allowed bg-[#E3E7E7] text-xs text-[#828D98] px-3"
                                    >
                                      <AppIcons.send className="mr-1.5 h-4 w-4 sm:h-3.5 sm:w-3.5 opacity-50" />
                                      Fora das 24h
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs text-xs">
                                  A janela de 24 horas da Meta expirou para esta conversa. O envio
                                  livre está bloqueado. Cadastre e aprove um Template de Mensagem em
                                  Configurações &gt; Templates para poder responder.
                                </TooltipContent>
                              </Tooltip>
                            ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 rounded-xl border border-dashed border-[#CBD6D7] bg-[#FAFCFC] p-3">
                        <p className="text-xs sm:text-[11px] text-[#7F8791] leading-relaxed">
                          Use a inteligência do lead para preparar uma resposta rápida.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={generating}
                          onClick={handleSuggest}
                          className="min-h-[44px] sm:min-h-[36px] sm:h-8 border-[#CBD6D7] text-xs text-[#464B5F] bg-white hover:bg-[#F2F5F5] font-medium touch-manipulation active:scale-95 shrink-0"
                        >
                          {generating ? (
                            <>
                              <AppIcons.aiSparkle className="mr-1.5 h-4 w-4 sm:h-3.5 sm:w-3.5 animate-spin text-[#E5A14C]" />
                              <ShinyText
                                text="Gerando resposta…"
                                color="#464B5F"
                                shineColor="#CBD6D7"
                                speed={1.8}
                              />
                            </>
                          ) : (
                            <>
                              <AppIcons.aiSparkle className="mr-1.5 h-4 w-4 sm:h-3.5 sm:w-3.5 text-[#E5A14C]" />
                              Gerar rascunho com IA
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ========================================================================= */}
              {/* 4. PAINEL DE INTELIGÊNCIA DO LEAD (Rail 60px / expandido 260px com peek)  */}
              {/* ========================================================================= */}
              <aside
                onMouseEnter={handleIntelMouseEnter}
                onMouseLeave={handleIntelMouseLeave}
                className={`hidden lg:flex flex-col shrink-0 bg-[#F8FAFA]/95 backdrop-blur-md transition-[width] duration-200 ease-out relative z-10 ${
                  isIntelExpanded ? 'w-[260px]' : 'w-[60px]'
                }`}
                aria-label="Inteligência do lead"
              >
                {/* Header do painel de inteligência */}
                <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#CBD6D7] px-3">
                  {isIntelExpanded ? (
                    <>
                      <p className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-[#929AA3]">
                        Inteligência do lead
                      </p>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={toggleIntel}
                            aria-label={
                              layout.intelOpen
                                ? 'Desafixar Inteligência (colapsar)'
                                : 'Fixar Inteligência aberta'
                            }
                            className={`flex h-7 items-center justify-center rounded-md px-2 text-xs font-medium border transition-colors ${
                              layout.intelOpen
                                ? 'border-[#E4C8CF] bg-[#FDF4F6] text-[#7B2D3B] hover:bg-[#F9E9ED]'
                                : 'border-[#CBD6D7] bg-white text-[#5F6D7C] hover:bg-[#EEF2F2] hover:text-[#464B5F]'
                            }`}
                          >
                            {layout.intelOpen ? (
                              <AppIcons.pinFilled className="h-3 w-3 text-[#7B2D3B]" />
                            ) : (
                              <AppIcons.pinSlash className="h-3 w-3 text-[#7A838E]" />
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="left">
                          {layout.intelOpen
                            ? 'Desafixar painel (fechar para rail)'
                            : 'Fixar painel aberto'}
                        </TooltipContent>
                      </Tooltip>
                    </>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={toggleIntel}
                          aria-label={
                            layout.intelOpen
                              ? 'Desafixar Inteligência do lead'
                              : 'Fixar Inteligência do lead aberta'
                          }
                          className={`mx-auto flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                            layout.intelOpen
                              ? 'border-[#E4C8CF] bg-[#FDF4F6] text-[#7B2D3B] shadow-xs'
                              : 'border-[#CBD6D7] bg-white text-[#5F6D7C] hover:bg-[#EEF2F2] hover:text-[#464B5F]'
                          }`}
                        >
                          <AppIcons.panelToggle className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="left">
                        {layout.intelOpen
                          ? 'Painel fixado — clique para desafixar'
                          : 'Fixar Inteligência do lead aberta'}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>

                {/* Conteúdo rolável do painel */}
                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3">
                  {isIntelExpanded ? (
                    <>
                      {/* Cartão de perfil do lead */}
                      <div className="flex items-center gap-2.5 rounded-lg border border-[#DCE4E4] bg-white p-2.5">
                        <AvatarWithFallback
                          name={displayName(selected.name, selected.phone)}
                          avatarUrl={selected.avatar_url}
                          size="sm"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-[#353B47]">
                            {displayName(selected.name, selected.phone)}
                          </p>
                          <p className="truncate text-[10px] text-[#818995]">
                            {formatPhone(selected.phone)}
                          </p>
                        </div>
                      </div>

                      <Insight
                        icon={AppIcons.intent}
                        iconColor="text-[#3B82F6]"
                        label="Intenção"
                        value={selected.intent}
                      />
                      {(() => {
                        const sharedContact = parseSharedContact(selected.summary)
                        if (sharedContact) {
                          return (
                            <div className="mt-4 border-b border-[#DDE5E5] pb-3">
                              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[#606A78]">
                                <AppIcons.summary className="h-3.5 w-3.5 text-[#F97316]" />
                                Resumo
                              </div>
                              <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-[#EDF7F2] px-2 py-1 text-[11px] font-medium text-[#2F6B4F] border border-[#BFDFCF]">
                                <AppIcons.contactCard className="h-3.5 w-3.5 shrink-0 text-[#2C8A55]" />
                                <span className="truncate">Contato: {sharedContact.name}</span>
                              </div>
                            </div>
                          )
                        }
                        return (
                          <Insight
                            icon={AppIcons.summary}
                            iconColor="text-[#F97316]"
                            label="Resumo"
                            value={selected.summary}
                          />
                        )
                      })()}
                      <Insight
                        icon={AppIcons.nextAction}
                        iconColor="text-[#8B5CF6]"
                        label="Próxima ação"
                        value={selected.next_action}
                      />

                      {selectedFollow && (
                        <div
                          className={`mt-4 rounded-lg border p-3 ${
                            new Date(selectedFollow.due_at) < new Date()
                              ? 'border-[#E9B8B2] bg-[#FFF4F2]'
                              : 'border-[#C9DCD4] bg-white'
                          }`}
                        >
                          <span className="text-[9px] font-bold uppercase tracking-wider text-[#A24840]">
                            {new Date(selectedFollow.due_at) < new Date()
                              ? 'Follow-up vencido'
                              : 'Follow-up agendado'}
                          </span>
                          <p className="mt-1 text-xs font-semibold text-[#353B47]">
                            {selectedFollow.title}
                          </p>
                          <p className="mt-1 text-[10px] text-[#7D858F]">
                            {fullDate(selectedFollow.due_at)}
                          </p>
                        </div>
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleOpenFollowUp}
                        className="mt-4 w-full border-[#CBD6D7] text-xs h-8 hover:bg-[#F8FAFA]"
                      >
                        <AppIcons.queueFollowUps className="mr-1.5 h-3.5 w-3.5 text-[#F97316]" />
                        Criar follow-up
                      </Button>

                      {zernioSettings?.operation_mode === 'read_write' ? (
                        <div className="mt-5 rounded-lg bg-[#EFF8F4] p-3 text-[10px] leading-4 text-[#3E6554]">
                          <div className="mb-2 flex items-center justify-between">
                            <AppIcons.send className="h-4 w-4 text-[#3FB980]" />
                            <a
                              href={ZERNIO_REFERRAL_URL}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[9px] font-medium text-[#2C8A55] hover:underline"
                            >
                              <ZernioLogo height={11} raw />
                              <span>↗</span>
                            </a>
                          </div>
                          <strong>Modo Envio Assistido ativo:</strong> Seus envios vão direto para o
                          cliente via API oficial da Meta (
                          <a
                            href={ZERNIO_REFERRAL_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium underline hover:text-[#2C8A55]"
                          >
                            Zernio
                          </a>
                          ), respeitando a janela de 24 horas.
                        </div>
                      ) : (
                        <div className="mt-5 rounded-lg bg-[#EFF6F3] p-3 text-[10px] leading-4 text-[#61756D]">
                          <AppIcons.modeReadOnly className="mb-2 h-4 w-4 text-[#5F6D7C]" />
                          <strong>Modo Revisão ativo:</strong> O assistente formula as sugestões
                          para sua supervisão e validação antes do envio.
                        </div>
                      )}
                    </>
                  ) : (
                    /* Versão rail fino colapsado (60px) */
                    <div className="flex flex-col items-center gap-3 py-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={toggleIntel}
                            className="flex flex-col items-center gap-1 rounded-lg p-1.5 hover:bg-white transition-colors"
                            aria-label={`Lead: ${displayName(selected.name, selected.phone)}`}
                          >
                            <AvatarWithFallback
                              name={displayName(selected.name, selected.phone)}
                              avatarUrl={selected.avatar_url}
                              size="sm"
                            />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="left">
                          <p className="font-semibold text-xs">
                            {displayName(selected.name, selected.phone)}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {formatPhone(selected.phone)}
                          </p>
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={toggleIntel}
                            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-transparent hover:border-[#CBD6D7] shadow-2xs transition-all"
                            aria-label={`Intenção: ${selected.intent || 'Contato'}`}
                          >
                            <AppIcons.intent className="h-4 w-4 text-[#3B82F6]" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="left">
                          <p className="font-semibold text-xs">Intenção</p>
                          <p className="text-[11px] text-muted-foreground">
                            {selected.intent || 'Sem informação'}
                          </p>
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={toggleIntel}
                            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-transparent hover:border-[#CBD6D7] shadow-2xs transition-all"
                            aria-label={(() => {
                              const sc = parseSharedContact(selected.summary)
                              return `Resumo: ${sc ? `Contato: ${sc.name}` : selected.summary || 'Resumo'}`
                            })()}
                          >
                            <AppIcons.summary className="h-4 w-4 text-[#F97316]" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-xs">
                          <p className="font-semibold text-xs">Resumo</p>
                          {(() => {
                            const sc = parseSharedContact(selected.summary)
                            if (sc) {
                              return (
                                <div className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-[#EDF7F2] px-1.5 py-0.5 text-[10px] font-medium text-[#2F6B4F] border border-[#BFDFCF]">
                                  <AppIcons.contactCard className="h-3 w-3 shrink-0 text-[#2C8A55]" />
                                  <span className="truncate">Contato: {sc.name}</span>
                                </div>
                              )
                            }
                            return (
                              <p className="text-[11px] text-muted-foreground">
                                {selected.summary || 'Sem resumo'}
                              </p>
                            )
                          })()}
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={toggleIntel}
                            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-transparent hover:border-[#CBD6D7] shadow-2xs transition-all"
                            aria-label={`Próxima ação: ${selected.next_action || 'Nenhuma'}`}
                          >
                            <AppIcons.nextAction className="h-4 w-4 text-[#8B5CF6]" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-xs">
                          <p className="font-semibold text-xs">Próxima ação</p>
                          <p className="text-[11px] text-muted-foreground">
                            {selected.next_action || 'Sem próxima ação'}
                          </p>
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={handleOpenFollowUp}
                            className={`flex h-9 w-9 items-center justify-center rounded-xl transition-all ${
                              selectedFollow
                                ? 'bg-orange-50 border border-orange-200 text-[#EA580C] shadow-2xs'
                                : 'bg-white border border-transparent hover:border-[#CBD6D7] text-[#606A78] shadow-2xs'
                            }`}
                            aria-label="Criar ou ver follow-up"
                          >
                            <AppIcons.queueFollowUps className="h-4 w-4 text-[#F97316]" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="left">
                          <p className="font-semibold text-xs">
                            {selectedFollow ? 'Follow-up ativo' : 'Criar follow-up'}
                          </p>
                          {selectedFollow && (
                            <p className="text-[11px] text-muted-foreground">
                              {selectedFollow.title} ({shortDate(selectedFollow.due_at)})
                            </p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  )}
                </div>
              </aside>
            </div>

            {/* Modal de FollowUp */}
            <FollowUpDialog
              conversationId={selected.id}
              name={selected.name}
              open={followOpen}
              onOpenChange={setFollowOpen}
            />

            {/* MODAL DE ENVIO POR TEMPLATE APROVADO PELA META (FORA DA JANELA DE 24H) */}
            {templateModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto">
                <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-4 sm:p-6 shadow-xl border border-[#CBD6D7]">
                  <div className="flex items-center justify-between border-b border-[#E8EFF0] pb-3">
                    <div className="flex items-center gap-2">
                      <div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-100 text-emerald-700 shrink-0">
                        <AppIcons.template className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold text-[#353B47] truncate">
                          Enviar Mensagem por Template
                        </h3>
                        <p className="text-[11px] text-[#7E8896] truncate">
                          Janela de 24h fechada · Usando template Meta
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTemplateModalOpen(false)}
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg p-1 text-[#8A929C] hover:bg-slate-100 touch-manipulation"
                      aria-label="Fechar"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="mt-4 space-y-4">
                    {/* Seletor de Template */}
                    <div>
                      <Label className="text-xs font-semibold text-[#464B5F]">
                        Selecione o template aprovado
                      </Label>
                      <select
                        value={selectedTemplate?.name || ''}
                        onChange={(e) => {
                          const t = approvedTemplates.find((x) => x.name === e.target.value) || null
                          setSelectedTemplate(t)
                          if (t) {
                            const vars = getTemplateVariables(t)
                            const iv: Record<string, string> = {}
                            vars.forEach((v) => {
                              if (v === '1' && selected?.name) {
                                iv[v] = selected.name.split(' ')[0]
                              } else {
                                iv[v] = ''
                              }
                            })
                            setTemplateVarValues(iv)
                          }
                        }}
                        className="mt-1 w-full rounded-md border border-[#CBD6D7] bg-white px-3 py-2 text-base md:text-xs text-[#353B47] font-medium"
                      >
                        {approvedTemplates.map((t) => (
                          <option key={t.id || t.name} value={t.name}>
                            {t.name} ({t.category || 'UTILITY'}) - {t.language || 'pt_BR'}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Pré-visualização do texto base */}
                    {selectedTemplate && (
                      <div className="rounded-lg border border-[#E8EFF0] bg-[#F8FAFA] p-3 text-xs leading-relaxed text-[#4A5568]">
                        <span className="block text-[10px] font-bold text-[#7E8896] uppercase mb-1">
                          Texto Original do Template
                        </span>
                        <p className="whitespace-pre-wrap break-words">
                          {selectedTemplate.components?.find(
                            (c) => (c.type || '').toUpperCase() === 'BODY',
                          )?.text ||
                            selectedTemplate.body ||
                            'Sem texto no corpo'}
                        </p>
                      </div>
                    )}

                    {/* Campos de Variáveis */}
                    {selectedTemplate && getTemplateVariables(selectedTemplate).length > 0 && (
                      <div className="space-y-2.5">
                        <Label className="text-xs font-semibold text-[#464B5F]">
                          Preencher variáveis dinâmicas
                        </Label>
                        {getTemplateVariables(selectedTemplate).map((varKey) => (
                          <div key={varKey} className="flex items-center gap-2">
                            <span className="w-16 shrink-0 rounded bg-emerald-50 px-2 py-1 font-mono text-[11px] font-bold text-emerald-800 text-center border border-emerald-200">
                              {`{{${varKey}}}`}
                            </span>
                            <Input
                              value={templateVarValues[varKey] || ''}
                              onChange={(e) =>
                                setTemplateVarValues((prev) => ({
                                  ...prev,
                                  [varKey]: e.target.value,
                                }))
                              }
                              placeholder={`Valor para {{${varKey}}}`}
                              className="border-[#CBD6D7] text-base md:text-xs h-10 md:h-8"
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Preview com variáveis preenchidas */}
                    {selectedTemplate && (
                      <div className="rounded-lg border border-[#BDE3D5] bg-[#F1FAF7] p-3 text-xs text-[#2F6B56]">
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-[#2F6B56] mb-1">
                          Prévia da mensagem final que o lead receberá
                        </span>
                        <p className="whitespace-pre-wrap font-medium break-words">
                          {(() => {
                            let preview =
                              selectedTemplate.components?.find(
                                (c) => (c.type || '').toUpperCase() === 'BODY',
                              )?.text ||
                              selectedTemplate.body ||
                              ''
                            getTemplateVariables(selectedTemplate).forEach((v) => {
                              preview = preview.replaceAll(
                                `{{${v}}}`,
                                templateVarValues[v] || `[${v}]`,
                              )
                            })
                            return preview
                          })()}
                        </p>
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E8EFF0]">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setTemplateModalOpen(false)}
                        disabled={sendingTemplate}
                        className="min-h-[44px] sm:min-h-[36px] text-xs text-[#637080] touch-manipulation"
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void handleSendTemplateMessage()}
                        disabled={sendingTemplate || !selectedTemplate}
                        className="min-h-[44px] sm:min-h-[36px] bg-[#10B981] hover:bg-[#059669] text-white text-xs font-semibold touch-manipulation"
                      >
                        {sendingTemplate ? (
                          <>
                            <AppIcons.spinner className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            Enviando via Zernio...
                          </>
                        ) : (
                          <>
                            <AppIcons.send className="mr-1.5 h-3.5 w-3.5" />
                            Confirmar e Enviar
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="grid flex-1 place-items-center bg-white/60 backdrop-blur-sm">
            <p className="text-sm text-[#858D97]">Selecione uma conversa.</p>
          </div>
        )}
      </div>
      {/* Bottom Sheet de troca de fila / prioridade no mobile */}
      <Sheet open={queueSheetOpen} onOpenChange={setQueueSheetOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl border-t border-[#CBD6D7] bg-white p-0 pb-[max(1.25rem,env(safe-area-inset-bottom))] max-h-[85vh] flex flex-col focus:outline-none"
        >
          <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-[#CBD6D7]" aria-hidden="true" />
          <SheetHeader className="px-5 pt-2 pb-3 border-b border-[#EEF2F2] text-left">
            <SheetTitle className="text-base font-bold text-[#353B47] flex items-center gap-2">
              <AppIcons.filterQueue className="h-4 w-4 text-[#3B82F6]" />
              <span>Filas e Prioridades</span>
            </SheetTitle>
            <SheetDescription className="text-xs text-[#7A838E]">
              Selecione o critério para organizar suas conversas por ordem de urgência.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {/* 1. Responder agora */}
            <button
              type="button"
              onClick={() => {
                setQueue('responder')
                setQueueSheetOpen(false)
              }}
              className={`w-full min-h-[56px] flex items-center justify-between rounded-xl px-3.5 py-3 text-left transition-all touch-manipulation active:scale-[0.99] border ${
                queue === 'responder'
                  ? 'border-[#BFDEC9] bg-[#EBF7F0] text-[#23583D] shadow-xs'
                  : 'border-transparent bg-[#F8FAFA] hover:bg-[#EEF2F2] text-[#353B47]'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#FEE2E2] text-[#EF4444]">
                  <AppIcons.queueUrgent className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-bold text-sm leading-tight text-[#353B47]">Responder agora</p>
                  <p className="text-xs text-[#6B7280] mt-0.5 leading-tight">
                    Prioridade mais alta primeiro · Sem resposta
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 pl-2">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${
                    counts.responder > 0
                      ? 'bg-[#FEE2E2] text-[#B91C1C]'
                      : 'bg-white border border-[#CBD6D7] text-[#6B7280]'
                  }`}
                >
                  {counts.responder}
                </span>
                {queue === 'responder' && (
                  <AppIcons.check className="h-4 w-4 text-[#2C8A55] stroke-[2.5]" />
                )}
              </div>
            </button>

            {/* 2. Follow-ups */}
            <button
              type="button"
              onClick={() => {
                setQueue('followups')
                setQueueSheetOpen(false)
              }}
              className={`w-full min-h-[56px] flex items-center justify-between rounded-xl px-3.5 py-3 text-left transition-all touch-manipulation active:scale-[0.99] border ${
                queue === 'followups'
                  ? 'border-[#FED7AA] bg-[#FFF7ED] text-[#9A3412] shadow-xs'
                  : 'border-transparent bg-[#F8FAFA] hover:bg-[#EEF2F2] text-[#353B47]'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#FFEDD5] text-[#F97316]">
                  <AppIcons.queueFollowUps className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-bold text-sm leading-tight text-[#353B47]">
                    Follow-ups agendados
                  </p>
                  <p className="text-xs text-[#6B7280] mt-0.5 leading-tight">
                    Lembretes com data/hora marcada pendentes
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 pl-2">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${
                    counts.followups > 0
                      ? 'bg-[#FFEDD5] text-[#C2410C]'
                      : 'bg-white border border-[#CBD6D7] text-[#6B7280]'
                  }`}
                >
                  {counts.followups}
                </span>
                {queue === 'followups' && (
                  <AppIcons.check className="h-4 w-4 text-[#EA580C] stroke-[2.5]" />
                )}
              </div>
            </button>

            {/* 3. Madrugada */}
            <button
              type="button"
              onClick={() => {
                setQueue('madrugada')
                setQueueSheetOpen(false)
              }}
              className={`w-full min-h-[56px] flex items-center justify-between rounded-xl px-3.5 py-3 text-left transition-all touch-manipulation active:scale-[0.99] border ${
                queue === 'madrugada'
                  ? 'border-[#DDD6FE] bg-[#F5F3FF] text-[#5B21B6] shadow-xs'
                  : 'border-transparent bg-[#F8FAFA] hover:bg-[#EEF2F2] text-[#353B47]'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#EDE9FE] text-[#8B5CF6]">
                  <AppIcons.queueNight className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-bold text-sm leading-tight text-[#353B47]">Plantão noturno</p>
                  <p className="text-xs text-[#6B7280] mt-0.5 leading-tight">
                    Mensagens recebidas durante a madrugada
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 pl-2">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${
                    counts.madrugada > 0
                      ? 'bg-[#EDE9FE] text-[#6D28D9]'
                      : 'bg-white border border-[#CBD6D7] text-[#6B7280]'
                  }`}
                >
                  {counts.madrugada}
                </span>
                {queue === 'madrugada' && (
                  <AppIcons.check className="h-4 w-4 text-[#7C3AED] stroke-[2.5]" />
                )}
              </div>
            </button>

            {/* 4. Em acompanhamento */}
            <button
              type="button"
              onClick={() => {
                setQueue('acompanhamento')
                setQueueSheetOpen(false)
              }}
              className={`w-full min-h-[56px] flex items-center justify-between rounded-xl px-3.5 py-3 text-left transition-all touch-manipulation active:scale-[0.99] border ${
                queue === 'acompanhamento'
                  ? 'border-[#A7F3D0] bg-[#ECFDF5] text-[#065F46] shadow-xs'
                  : 'border-transparent bg-[#F8FAFA] hover:bg-[#EEF2F2] text-[#353B47]'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#D1FAE5] text-[#10B981]">
                  <AppIcons.queueTracking className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-bold text-sm leading-tight text-[#353B47]">
                    Em acompanhamento
                  </p>
                  <p className="text-xs text-[#6B7280] mt-0.5 leading-tight">
                    Já respondidas ou aguardando resposta do cliente
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 pl-2">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${
                    counts.acompanhamento > 0
                      ? 'bg-[#D1FAE5] text-[#047857]'
                      : 'bg-white border border-[#CBD6D7] text-[#6B7280]'
                  }`}
                >
                  {counts.acompanhamento}
                </span>
                {queue === 'acompanhamento' && (
                  <AppIcons.check className="h-4 w-4 text-[#059669] stroke-[2.5]" />
                )}
              </div>
            </button>

            {/* 5. Todas as conversas */}
            <button
              type="button"
              onClick={() => {
                setQueue('todas')
                setQueueSheetOpen(false)
              }}
              className={`w-full min-h-[56px] flex items-center justify-between rounded-xl px-3.5 py-3 text-left transition-all touch-manipulation active:scale-[0.99] border ${
                queue === 'todas'
                  ? 'border-[#BFDBFE] bg-[#EFF6FF] text-[#1E40AF] shadow-xs'
                  : 'border-transparent bg-[#F8FAFA] hover:bg-[#EEF2F2] text-[#353B47]'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#DBEAFE] text-[#3B82F6]">
                  <AppIcons.queueAll className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-bold text-sm leading-tight text-[#353B47]">
                    Todas as conversas
                  </p>
                  <p className="text-xs text-[#6B7280] mt-0.5 leading-tight">
                    Histórico completo sem filtros de status
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 pl-2">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${
                    counts.todas > 0
                      ? 'bg-[#DBEAFE] text-[#1D4ED8]'
                      : 'bg-white border border-[#CBD6D7] text-[#6B7280]'
                  }`}
                >
                  {counts.todas}
                </span>
                {queue === 'todas' && (
                  <AppIcons.check className="h-4 w-4 text-[#2563EB] stroke-[2.5]" />
                )}
              </div>
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function QueueItem({
  label,
  icon: Icon,
  iconColor,
  count,
  active,
  collapsed,
  danger,
  onClick,
}: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  iconColor?: string
  count: number
  active: boolean
  collapsed: boolean
  danger?: boolean
  onClick: () => void
}) {
  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            aria-label={`${label} (${count})`}
            className={`relative flex h-10 w-full items-center justify-center rounded-lg transition-colors ${
              active
                ? 'bg-white text-[#3D5F53] ring-1 ring-[#CBD6D7]'
                : 'text-[#707985] hover:bg-white'
            }`}
          >
            <Icon className={`h-4 w-4 ${iconColor || ''}`} />
            {count > 0 && (
              <span
                className={`absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-semibold tabular-nums leading-none ${
                  danger ? 'bg-[#FFF0EE] text-[#B74D43]' : 'bg-[#EDF2F1] text-[#464B5F]'
                }`}
              >
                {count > 99 ? '99+' : count}
              </span>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">
          <span>{label}</span>
          <span className="ml-1.5 font-bold">({count})</span>
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors ${
        active ? 'bg-white text-[#3D5F53] ring-1 ring-[#CBD6D7]' : 'text-[#707985] hover:bg-white'
      }`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${iconColor || ''}`} />
      <span className="flex-1 truncate">{label}</span>
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] tabular-nums font-semibold shrink-0 ${
          danger && count ? 'bg-[#FFF0EE] text-[#B74D43]' : 'bg-[#EDF2F1] text-[#464B5F]'
        }`}
      >
        {count}
      </span>
    </button>
  )
}

function formatPhone(phone: string): string {
  if (!phone) return ''
  const clean = phone.replace(/\D/g, '')
  if (clean.length === 13 && clean.startsWith('55')) {
    return `+55 (${clean.slice(2, 4)}) ${clean.slice(4, 9)}-${clean.slice(9)}`
  }
  if (clean.length === 12 && clean.startsWith('55')) {
    return `+55 (${clean.slice(2, 4)}) ${clean.slice(4, 8)}-${clean.slice(8)}`
  }
  if (clean.length === 11) {
    return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`
  }
  return phone
}

function displayName(name: string, phone: string): string {
  if (!name) return formatPhone(phone) || 'Contato'
  const isNumeric = /^\+?[0-9]{8,16}$/.test(name.replace(/\s+/g, ''))
  if (isNumeric) {
    return formatPhone(name)
  }
  return name
}

function AvatarWithFallback({
  name,
  avatarUrl,
  size = 'md',
}: {
  name: string
  avatarUrl?: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
}) {
  const [imgError, setImgError] = useState(false)

  const sizeClasses = {
    xs: 'h-6 w-6 text-[9px]',
    sm: 'h-7 w-7 text-[10px]',
    md: 'h-9 w-9 text-xs',
    lg: 'h-10 w-10 text-sm',
  }[size]

  const cleanName = name.replace(/^[+0-9\s()-]+$/, '').trim() || name
  const initials =
    cleanName
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'W'

  if (avatarUrl && !imgError) {
    return (
      <div
        className={`relative shrink-0 overflow-hidden rounded-full border border-[#CBD6D7] bg-[#E5F1ED] ${sizeClasses}`}
      >
        <img
          src={avatarUrl}
          alt={name}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
        />
      </div>
    )
  }

  return (
    <div
      className={`grid shrink-0 place-items-center rounded-full border border-[#CBD6D7] bg-[#EEF5F3] font-bold text-[#456B5D] ${sizeClasses}`}
    >
      {initials}
    </div>
  )
}

function ConversationCard({
  conversation,
  active,
  viaLabel,
  followUp,
  onClick,
}: {
  conversation: Conversation
  active: boolean
  viaLabel?: string
  followUp?: { due_at: string }
  onClick: () => void
}) {
  const overdue = followUp && new Date(followUp.due_at) < new Date()
  const nameToDisplay = displayName(conversation.name, conversation.phone)
  const isOutbound = conversation.last_direction === 'out'
  const isUnread =
    conversation.last_direction === 'in' &&
    conversation.status !== 'acompanhamento' &&
    conversation.status !== 'respondida'
  const formattedSenderPhone = formatPhone(conversation.phone)

  return (
    <button
      type="button"
      onClick={onClick}
      className={`mb-2 w-full rounded-xl border p-3 text-left transition-colors relative touch-manipulation active:scale-[0.99] min-h-[58px] ${
        active
          ? 'border-[#83AE9C] bg-[#F5FCF8] ring-1 ring-[#83AE9C]'
          : 'border-[#DDE4E4] bg-white hover:border-[#AFC2BE]'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <div className="relative">
          <AvatarWithFallback name={nameToDisplay} avatarUrl={conversation.avatar_url} size="sm" />
          <div className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white ring-1 ring-[#DCE4E4]">
            <span className="h-2 w-2 rounded-full bg-[#25D366]" />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1.5">
            <div className="min-w-0 flex-1 flex items-baseline gap-1.5 overflow-hidden">
              <strong className="truncate text-xs text-[#353B47] font-semibold">
                {nameToDisplay}
              </strong>
              {formattedSenderPhone && formattedSenderPhone !== nameToDisplay && (
                <span className="hidden sm:inline shrink-0 text-[10px] text-[#8B939C] truncate">
                  · {formattedSenderPhone}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] text-[#8B939C]">
                {relativeTime(conversation.last_message_at)}
              </span>
              {isUnread && (
                <span
                  className="h-2 w-2 rounded-full bg-[#E53E3E]"
                  title="Mensagem pendente de resposta"
                />
              )}
            </div>
          </div>

          {viaLabel && (
            <div className="mt-0.5 inline-flex items-center gap-1 text-[9px] font-medium text-[#7B2D3B] bg-[#FDF4F6] px-1.5 py-0.2 rounded-none border border-[#E4C8CF]/60">
              <span className="h-1 w-1 rounded-full bg-[#7B2D3B]" />
              {viaLabel}
            </div>
          )}

          {(() => {
            const contactInfo = parseSharedContact(conversation.summary)
            if (contactInfo) {
              return (
                <div className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-[#EDF7F2] px-1.5 py-0.5 text-[10px] font-medium text-[#2F6B4F] border border-[#BFDFCF]">
                  <AppIcons.contactCard className="h-3 w-3 shrink-0 text-[#2C8A55]" />
                  <span className="truncate">Contato: {contactInfo.name}</span>
                </div>
              )
            }
            return (
              <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-[#727B86]">
                {conversation.summary}
              </p>
            )
          })()}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {!isOutbound && conversation.status === 'sem_resposta' && (
          <Chip tone="danger">Sem resposta há {hoursSince(conversation.last_message_at)}h</Chip>
        )}
        {!isOutbound && conversation.status === 'madrugada' && (
          <Chip tone="night">Madrugada · {shortDate(conversation.last_message_at)}</Chip>
        )}
        {(isOutbound ||
          conversation.status === 'acompanhamento' ||
          conversation.status === 'respondida') && (
          <Chip>
            Em acompanhamento
            {conversation.responded_at
              ? ` · Respondida ${relativeTime(conversation.responded_at)}`
              : isOutbound
                ? ` · Enviada ${relativeTime(conversation.last_message_at)}`
                : ''}
          </Chip>
        )}
        {followUp && (
          <Chip tone={overdue ? 'danger' : 'default'}>
            {overdue ? 'Follow-up vencido' : `Follow-up: ${shortDate(followUp.due_at)}`}
          </Chip>
        )}
      </div>
    </button>
  )
}

function Chip({
  children,
  tone = 'default',
}: {
  children: React.ReactNode
  tone?: 'danger' | 'night' | 'default'
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-medium border transition-colors ${
        tone === 'danger'
          ? 'bg-rose-50 text-rose-700 border-rose-200/70'
          : tone === 'night'
            ? 'bg-purple-50 text-purple-700 border-purple-200/70'
            : 'bg-[#F8FAFA] text-[#4E5664] border-[#CBD6D7]'
      }`}
    >
      {children}
    </span>
  )
}

function Insight({
  icon: Icon,
  iconColor = 'text-[#3B82F6]',
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  iconColor?: string
  label: string
  value: string
}) {
  return (
    <div className="mt-4 border-b border-[#DDE5E5] pb-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[#606A78]">
        <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
        {label}
      </div>
      <p className="mt-1 text-[11px] leading-4 text-[#535B69]">{value || 'Sem informação'}</p>
    </div>
  )
}
