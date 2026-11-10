import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppIcons } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { useCrm } from '@/contexts/CrmContext'
import { InboxSidebar } from '@/components/inbox/InboxSidebar'
import ShinyText from '@/components/reactbits/ShinyText'
import { AgentMarkdown } from '@/components/AgentMarkdown'
import { ActionProposalCard } from '@/components/ActionProposalCard'
import { ToolCallsView } from '@/components/ToolCallsView'
import { AgentOrb } from '@/components/AgentOrb'
import {
  DraftTemplatePreviewCard,
  type DraftTemplateData,
} from '@/components/DraftTemplatePreviewCard'
import {
  sendAgentMessageStream,
  listAgentConversations,
  loadAgentMessages,
  listUserAgentActions,
  approveAgentAction,
  rejectAgentAction,
  type AgentConversationItem,
  type AgentActionRecord,
  type ToolCallUIState,
} from '@/services/agent'
import pb from '@/lib/pocketbase/client'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  created?: string
  toolCalls?: ToolCallUIState[]
  proposals?: AgentActionRecord[]
  draftTemplate?: DraftTemplateData | null
}

const QUICK_PROMPTS = [
  'Crie um template de lembrete de agendamento',
  'Crie um template de oferta para meus clientes',
  'Quem está sem resposta há mais de 2 dias?',
  'Quais são os leads mais quentes agora?',
]

/**
 * Função utilitária para extrair rascunho de template do texto da mensagem do assistente.
 * Detecta se a mensagem apresenta um rascunho (corpo com {{1}}, nome, categoria, exemplo preenchido)
 * e estrutura em objeto para renderização de alta fidelidade antes da proposta.
 */
function extractDraftFromContent(content: string): DraftTemplateData | null {
  if (!content) return null

  // Só é rascunho se tiver variáveis {{1}} ou mencionar explicitamente estrutura de template/rascunho
  const hasVariables = /\{\{\s*(\d+|\w+)\s*\}\}/.test(content)
  const mentionsDraft =
    /rascunho|template sugerido|manda pra meta|exemplo preenchido|como vai ficar|prévia do template/i.test(
      content,
    )

  if (!hasVariables && !mentionsDraft) return null

  // Se a mensagem diz claramente que a ação/card oficial já foi gerada com Aprovo/Não aprovo,
  // ou já tem uma ação associada, preferir não mostrar card de rascunho redundante
  if (/card (?:de proposta )?abaixo aguardando sua aprovação|clique em "aprovo"/i.test(content)) {
    return null
  }

  // 1. Extrair nome do template
  let name = 'template_sugerido'
  const nameMatch =
    content.match(/nome\s*(?:técnico)?\s*[:=]\s*`?([a-z0-9_]+)`?/i) ||
    content.match(/name["':\s]+([a-z0-9_]+)/i) ||
    content.match(/template\s+`([a-z0-9_]+)`/i)
  if (nameMatch && nameMatch[1]) {
    name = nameMatch[1].toLowerCase().replace(/[^a-z0-9_]/g, '_')
  }

  // 2. Extrair categoria
  let category = 'UTILITY'
  if (/MARKETING/i.test(content) && !/UTILITY/i.test(content)) {
    category = 'MARKETING'
  } else if (/AUTHENTICATION/i.test(content)) {
    category = 'AUTHENTICATION'
  }

  // 3. Extrair corpo do template (texto com variáveis)
  let bodyText = ''
  // Checar bloco de código markdown ```whatsapp ... ``` ou similar
  const codeBlocks = content.match(/```(?:whatsapp|text|markdown)?\s*\n?([\s\S]*?)```/g)
  if (codeBlocks && codeBlocks.length > 0) {
    for (const cb of codeBlocks) {
      const clean = cb
        .replace(/```(?:whatsapp|text|markdown)?/g, '')
        .replace(/```/g, '')
        .trim()
      if (/\{\{\s*(\d+|\w+)\s*\}\}/.test(clean)) {
        bodyText = clean
        break
      }
    }
  }

  // Se não achou em bloco de código, buscar seção "Texto do template", "Corpo", etc.
  if (!bodyText) {
    const bodySectionMatch = content.match(
      /(?:texto|corpo)(?:\s+do\s+template)?\s*[:=]\s*\n*([^\n]+(?:\n[^\n]+)*?)(?=\n\s*(?:exemplo|categoria|botões|se você|opções)|\n\n|$)/i,
    )
    if (bodySectionMatch && bodySectionMatch[1]) {
      const candidate = bodySectionMatch[1].trim()
      if (/\{\{\s*(\d+|\w+)\s*\}\}/.test(candidate)) {
        bodyText = candidate
      }
    }
  }

  // Se ainda não achou, buscar a primeira linha com {{1}}
  if (!bodyText) {
    const lines = content.split('\n')
    for (const l of lines) {
      const trimmed = l
        .trim()
        .replace(/^[-*•>]\s*/, '')
        .replace(/^"|"$/g, '')
      if (/\{\{\s*(\d+|\w+)\s*\}\}/.test(trimmed)) {
        bodyText = trimmed
        break
      }
    }
  }

  if (!bodyText) return null

  // 4. Extrair exemplo preenchido (se houver seção de exemplo)
  let exampleFilledText = ''
  const exampleMatch = content.match(
    /(?:exemplo\s+preenchido|como\s+vai\s+ficar|na\s+prática|mensagem\s+de\s+exemplo)\s*[:=]\s*\n*(?:>|")?\s*([^\n]+(?:\n[^\n]+)*?)(?=\n\s*(?:botões|se você|opções|digite)|\n\n|$)/i,
  )
  if (exampleMatch && exampleMatch[1]) {
    exampleFilledText = exampleMatch[1].replace(/^>\s*/gm, '').replace(/^"|"$/g, '').trim()
  }

  // 5. Extrair botões se existirem
  const buttons: Array<{ type: string; text: string; url?: string }> = []
  if (/bot[õo]es|quick reply/i.test(content)) {
    const btnMatches = content.match(/\[([A-Z0-9\s/]+)\]/g)
    if (btnMatches) {
      for (const bm of btnMatches) {
        const txt = bm.replace(/[[\]]/g, '').trim()
        if (txt && !/bot[õo]es/i.test(txt) && txt.length <= 25) {
          buttons.push({ type: 'QUICK_REPLY', text: txt })
        }
      }
    }
  }

  // 6. Extrair valores de amostra para as variáveis
  const examples: Record<string, string> = {
    1: 'Carlos',
    2: 'Amanhã às 14h',
    3: 'Rua das Flores, 123',
  }

  return {
    name,
    category,
    language: 'pt_BR',
    bodyText,
    exampleFilledText: exampleFilledText || undefined,
    examples,
    buttons: buttons.length > 0 ? buttons : undefined,
  }
}

export default function Agent() {
  const { user } = useAuth()
  const { conversations } = useCrm()
  const navigate = useNavigate()

  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [conversationsList, setConversationsList] = useState<AgentConversationItem[]>([])
  const [loadingList, setLoadingList] = useState(true)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [toolStatus, setToolStatus] = useState<string | null>(null)
  const [activeToolCalls, setActiveToolCalls] = useState<ToolCallUIState[]>([])
  const [submittingDraft, setSubmittingDraft] = useState(false)

  // Mobile navigation view: 'list' (sessões) ou 'chat' (chat em tela cheia)
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('chat')

  // Todas as ações do usuário (para associar cards de propostas e sobreviver a reload)
  const [allUserActions, setAllUserActions] = useState<AgentActionRecord[]>([])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const pollingIntervalRef = useRef<number | null>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isStreaming, toolStatus, activeToolCalls])

  // 1. Carregar lista de conversas e ações do usuário
  const refreshActions = async () => {
    try {
      const actions = await listUserAgentActions(50)
      setAllUserActions(actions)
      return actions
    } catch (_) {
      return []
    }
  }

  useEffect(() => {
    let mounted = true
    async function loadInitial() {
      setLoadingList(true)
      try {
        const [list, actions] = await Promise.all([
          listAgentConversations(30),
          listUserAgentActions(50),
        ])
        if (mounted) {
          setConversationsList(list)
          setAllUserActions(actions)
          if (list.length > 0 && !activeConversationId) {
            setActiveConversationId(list[0].id)
          }
        }
      } catch (err) {
        console.warn('Erro ao carregar dados iniciais:', err)
      } finally {
        if (mounted) setLoadingList(false)
      }
    }
    void loadInitial()
    return () => {
      mounted = false
    }
  }, [])

  // 2. Carregar mensagens quando a conversa ativa mudar
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([])
      return
    }

    let mounted = true
    async function loadThread(id: string) {
      setLoadingMessages(true)
      try {
        const [history, actions] = await Promise.all([
          loadAgentMessages(id),
          listUserAgentActions(50),
        ])
        if (mounted) {
          setAllUserActions(actions)
          setMessages(
            history.map((m) => {
              const role = m.role as 'user' | 'assistant'
              const draft = role === 'assistant' ? extractDraftFromContent(m.content) : null
              return {
                id: m.id,
                role,
                content: m.content,
                created: m.created,
                draftTemplate: draft,
              }
            }),
          )
        }
      } catch (err) {
        console.warn('Erro ao carregar mensagens:', err)
        if (mounted) setMessages([])
      } finally {
        if (mounted) setLoadingMessages(false)
      }
    }

    void loadThread(activeConversationId)
    return () => {
      mounted = false
    }
  }, [activeConversationId])

  // Polling leve durante o streaming para atualizar as actions criadas pelo agente em tempo real
  useEffect(() => {
    if (isStreaming) {
      pollingIntervalRef.current = window.setInterval(() => {
        void refreshActions()
      }, 1500)
    } else {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    }
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    }
  }, [isStreaming])

  const handleStartNewChat = () => {
    if (isStreaming) {
      abortControllerRef.current?.abort()
      setIsStreaming(false)
    }
    setActiveConversationId(null)
    setMessages([])
    setInputValue('')
    setToolStatus(null)
    setActiveToolCalls([])
    setMobileView('chat')
  }

  const handleSelectSession = (id: string) => {
    setActiveConversationId(id)
    setMobileView('chat')
  }

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputValue).trim()
    if (!text || isStreaming) return

    setInputValue('')

    const tempUserMsgId = `user_${Date.now()}`
    const tempAssistantMsgId = `asst_${Date.now()}`
    const turnStartTime = Date.now()

    const userMsg: ChatMessage = {
      id: tempUserMsgId,
      role: 'user',
      content: text,
      created: new Date().toISOString(),
    }

    const assistantMsg: ChatMessage = {
      id: tempAssistantMsgId,
      role: 'assistant',
      content: '',
      created: new Date().toISOString(),
      toolCalls: [],
    }

    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setIsStreaming(true)
    setActiveToolCalls([])
    setToolStatus('Consultando informações...')

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const result = await sendAgentMessageStream(text, activeConversationId, {
        signal: controller.signal,
        onToolCallStart: (tool) => {
          let toolLabel = `em ${tool.name}`
          if (tool.name === 'conversations') toolLabel = 'Consultando conversas...'
          else if (tool.name === 'messages') toolLabel = 'Buscando histórico de mensagens...'
          else if (tool.name === 'follow_ups') toolLabel = 'Verificando follow-ups...'
          else if (tool.name === 'agent_actions')
            toolLabel = 'Preparando proposta de ação Zernio...'
          else toolLabel = `Executando ${tool.name}...`

          setToolStatus(toolLabel)

          setActiveToolCalls((prev) => {
            const existing = prev.find((t) => t.id === tool.id)
            if (existing) return prev
            const newTc: ToolCallUIState = {
              id: tool.id,
              name: tool.name,
              status: 'running',
              label: toolLabel,
              startTime: Date.now(),
            }
            return [...prev, newTc]
          })
        },
        onToolCallDone: (tool) => {
          setActiveToolCalls((prev) =>
            prev.map((t) =>
              t.id === tool.id
                ? {
                    ...t,
                    status: tool.ok ? 'completed' : 'failed',
                    endTime: Date.now(),
                  }
                : t,
            ),
          )
          setToolStatus('Processando resposta do agente...')
          // Buscar imediatamente registros de agent_actions se foi essa ferramenta
          void refreshActions()
        },
        onChunk: (_delta, accumulated) => {
          setToolStatus(null)
          setMessages((prev) =>
            prev.map((m) => (m.id === tempAssistantMsgId ? { ...m, content: accumulated } : m)),
          )
        },
      })

      // Fixar id final e se era uma conversa nova, atualizar estado e lista
      if (result.conversationId && result.conversationId !== activeConversationId) {
        setActiveConversationId(result.conversationId)
        const updatedList = await listAgentConversations(30)
        setConversationsList(updatedList)
      }

      // Buscar ações criadas pelo agente neste turno
      // Margem generosa de tempo (45s antes do turno) e fallback para qualquer ação pending_approval recente
      const updatedActions = await refreshActions()
      let turnActions = updatedActions.filter((a) => {
        const aTime = new Date(a.created).getTime()
        return aTime >= turnStartTime - 45000
      })

      // Fallback: se o agente executou agent_actions ou a resposta menciona proposta,
      // mas nenhuma ação bateu na janela, pegar a ação mais recente do usuário se estiver pending_approval
      if (turnActions.length === 0 && updatedActions.length > 0) {
        const hasAgentActionTool = result.toolCalls.some((tc) => tc.name === 'agent_actions')
        const mentionsProposal =
          /proposta|template|aprova[çc][ãa]o|aprovo/i.test(result.content) ||
          /template|mensagem|proposta/i.test(text)
        if (hasAgentActionTool || mentionsProposal) {
          const latestPending = updatedActions.find((a) => a.status === 'pending_approval')
          if (latestPending) {
            turnActions = [latestPending]
          }
        }
      }

      // Guardar toolCalls concluídas no histórico da mensagem do assistente
      const finalToolStates: ToolCallUIState[] = result.toolCalls.map((tc) => ({
        id: tc.id,
        name: tc.name,
        status: tc.ok ? 'completed' : 'failed',
        label: tc.name,
        startTime: turnStartTime,
        endTime: Date.now(),
        actionRecord: tc.name === 'agent_actions' ? turnActions[0] : undefined,
      }))

      const extractedDraft =
        turnActions.length === 0 ? extractDraftFromContent(result.content) : null

      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempAssistantMsgId
            ? {
                ...m,
                content: result.content,
                toolCalls: finalToolStates,
                proposals: turnActions,
                draftTemplate: extractedDraft,
              }
            : m,
        ),
      )

      setToolStatus(null)
      setActiveToolCalls([])
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return
      }
      const msg = err instanceof Error ? err.message : 'Falha ao consultar o Agente.'
      toast.error(msg)
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempAssistantMsgId
            ? {
                ...m,
                content:
                  'Desculpe, ocorreu um erro ao consultar seus dados de conversas. Tente novamente.',
              }
            : m,
        ),
      )
    } finally {
      setIsStreaming(false)
      setToolStatus(null)
      abortControllerRef.current = null
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSendMessage()
    }
  }

  // Atualizar ação quando aprovada ou recusada pelo usuário
  const handleActionUpdated = (updated: AgentActionRecord) => {
    setAllUserActions((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
    setMessages((prev) =>
      prev.map((m) => ({
        ...m,
        proposals: m.proposals?.map((p) => (p.id === updated.id ? updated : p)),
      })),
    )
  }

  // Feedback de recusa enviado ao agente
  const handleRejectFeedback = (actionId: string, feedback: string) => {
    const feedbackPrompt = `Recusei a proposta ${actionId}. Motivo: ${feedback}. Por favor, ajuste conforme minhas instruções.`
    void handleSendMessage(feedbackPrompt)
  }

  // Interação do rascunho: "Manda pra Meta"
  // (a) se existir ação associada em pending_approval, chamar approveAgentAction(actionId) imediatamente;
  // (b) se não existir, criar a ação e já disparar a aprovação — executando a criação na Zernio e atualizando o card com o resultado real (status Meta, ID, ou erro verdadeiro em caso de falha).
  const handleSendDraftToMeta = async (draft: DraftTemplateData) => {
    if (submittingDraft) return
    setSubmittingDraft(true)

    try {
      const activeUserId = user?.id || pb.authStore.model?.id
      if (!activeUserId) {
        toast.error('Autenticação necessária para enviar à Meta.')
        return
      }

      // Procurar se já existe uma ação pendente de aprovação com este template
      let targetActionId = draft.actionId
      if (!targetActionId) {
        const foundAction = allUserActions.find((a) => {
          if (a.status !== 'pending_approval' || a.action_type !== 'create_zernio_template')
            return false
          const pName = (a.params?.name || a.params?.template_name || '') as string
          return (
            pName.toLowerCase() === draft.name.toLowerCase() ||
            String(a.params?.body || '').includes(draft.bodyText.slice(0, 30))
          )
        })
        if (foundAction) {
          targetActionId = foundAction.id
        }
      }

      // Se ainda não existir ação, criá-la em agent_actions
      if (!targetActionId) {
        toast.info('Criando proposta de template...')
        const newRecord = await pb.collection('agent_actions').create({
          user: activeUserId,
          action_type: 'create_zernio_template',
          status: 'pending_approval',
          params: {
            name: draft.name,
            category: draft.category || 'UTILITY',
            language: draft.language || 'pt_BR',
            header_text: draft.headerText || undefined,
            body: draft.bodyText,
            footer_text: draft.footerText || undefined,
            examples: draft.examples,
            buttons: draft.buttons && draft.buttons.length > 0 ? draft.buttons : undefined,
          },
        })
        targetActionId = newRecord.id
        await refreshActions()
      }

      // Agora disparar a aprovação imediatamente para enviar à Meta via Zernio
      toast.info('Enviando template para a Meta via Zernio...')
      const approveRes = await approveAgentAction(targetActionId)
      const updatedRecord = approveRes.record || {
        id: targetActionId,
        user: activeUserId,
        action_type: 'create_zernio_template' as const,
        status: approveRes.status,
        params: { name: draft.name, body: draft.bodyText },
        result: null,
        error_message: approveRes.error_message,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      }

      handleActionUpdated(updatedRecord)

      // Atualizar o card do rascunho com o resultado real
      setMessages((prev) =>
        prev.map((m) => {
          if (m.draftTemplate && m.draftTemplate.name === draft.name) {
            return {
              ...m,
              draftTemplate: {
                ...m.draftTemplate,
                actionId: targetActionId,
                actionStatus: approveRes.status,
                actionError: approveRes.error_message,
              },
            }
          }
          return m
        }),
      )

      if (approveRes.status === 'completed') {
        toast.success('Template enviado à Meta via Zernio com sucesso!')
      } else if (approveRes.status === 'failed') {
        toast.error(approveRes.error_message || 'Falha ao criar template na Zernio.')
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Falha ao enviar template à Meta.'
      toast.error(errMsg)
      // Atualizar card com erro
      setMessages((prev) =>
        prev.map((m) => {
          if (m.draftTemplate && m.draftTemplate.name === draft.name) {
            return {
              ...m,
              draftTemplate: {
                ...m.draftTemplate,
                actionStatus: 'failed',
                actionError: errMsg,
              },
            }
          }
          return m
        }),
      )
    } finally {
      setSubmittingDraft(false)
      void refreshActions()
    }
  }

  // Interação do rascunho: "Fazer alteração"
  // Rejeita ação pendente associada se houver e envia feedback objetivo ao agente
  const handleRequestDraftChanges = async (draft: DraftTemplateData, feedback?: string) => {
    const reason =
      feedback && feedback.trim() ? feedback.trim() : 'Solicitadas alterações no texto do template'

    // Se houver ação associada ou recente para este template em pending_approval, rejeitar formalmente
    let targetActionId = draft.actionId
    if (!targetActionId) {
      const foundAction = allUserActions.find((a) => {
        if (a.status !== 'pending_approval' || a.action_type !== 'create_zernio_template')
          return false
        const pName = (a.params?.name || a.params?.template_name || '') as string
        return (
          pName.toLowerCase() === draft.name.toLowerCase() ||
          String(a.params?.body || '').includes(draft.bodyText.slice(0, 30))
        )
      })
      if (foundAction) targetActionId = foundAction.id
    }

    if (targetActionId) {
      try {
        await rejectAgentAction(targetActionId, reason)
        void refreshActions()
      } catch {
        /* intentionally ignored */
      }
    }

    // Atualizar estado do card
    setMessages((prev) =>
      prev.map((m) => {
        if (m.draftTemplate && m.draftTemplate.name === draft.name) {
          return {
            ...m,
            draftTemplate: {
              ...m.draftTemplate,
              actionStatus: 'rejected',
              actionError: reason,
            },
          }
        }
        return m
      }),
    )

    const prompt =
      feedback && feedback.trim()
        ? `Quero fazer uma alteração no template ${draft.name}: ${feedback.trim()}`
        : `Quero fazer alterações no texto do template ${draft.name}. Quais opções posso ajustar?`
    void handleSendMessage(prompt)
  }

  // Associar propostas históricas a mensagens mesmo após reload
  // Propostas pendentes de aprovação ficam evidentes e utilizáveis a qualquer momento
  const unattachedPendingProposals = useMemo(() => {
    const attachedIds = new Set<string>()
    for (const m of messages) {
      if (m.proposals) {
        for (const p of m.proposals) attachedIds.add(p.id)
      }
    }
    return allUserActions.filter((a) => !attachedIds.has(a.id) && a.status === 'pending_approval')
  }, [allUserActions, messages])

  // Quando o histórico de mensagens é carregado após reload ou troca de conversa,
  // associar propostas históricas ou pendentes às mensagens do assistente que as mencionam
  useEffect(() => {
    if (messages.length === 0 || allUserActions.length === 0) return

    setMessages((prev) => {
      let changed = false
      const updated = prev.map((msg) => {
        if (msg.role !== 'assistant') return msg
        if (msg.proposals && msg.proposals.length > 0) return msg

        // Se a mensagem cita proposta/template e há ações pending_approval correspondentes
        const contentLower = msg.content.toLowerCase()
        const isProposalMsg =
          contentLower.includes('proposta') ||
          contentLower.includes('template') ||
          contentLower.includes('aguardando sua aprovação') ||
          contentLower.includes('clique em aprovo')

        if (isProposalMsg) {
          // Achar a ação criada em data próxima da mensagem ou qualquer pending_approval correspondente
          const msgTime = msg.created ? new Date(msg.created).getTime() : 0
          const matchingAction =
            allUserActions.find((a) => {
              const aTime = new Date(a.created).getTime()
              if (msgTime > 0 && Math.abs(aTime - msgTime) <= 120000) return true
              return false
            }) || allUserActions.find((a) => a.status === 'pending_approval')

          if (matchingAction) {
            changed = true
            return {
              ...msg,
              proposals: [matchingAction],
            }
          }
        }
        return msg
      })

      return changed ? updated : prev
    })
  }, [allUserActions, messages.length])

  return (
    <div className="h-full w-full overflow-hidden relative flex bg-slate-900">
      {/* Imagem de fundo azul-gelo da demo */}
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage:
            "url('https://res.cloudinary.com/dfrzlhyvi/image/upload/v1789769629/bg-exemplo-2-azul-gelo_bfo81i.png')",
        }}
        aria-hidden="true"
      />

      {/* 1. SIDEBAR DE FILAS (reutilizada) */}
      <InboxSidebar onSelectQueue={() => navigate('/inbox')} />

      {/* 2. COLUNA DO MEIO: LISTA DE CONVERSAS DO AGENTE (No mobile: alternância com o chat) */}
      <section
        className={`relative z-10 flex-col border-r border-[#CBD6D7]/80 backdrop-blur-md shrink-0 min-h-0 bg-white/95 w-full md:w-[280px] lg:w-[300px] xl:w-[320px] ${
          mobileView === 'list' ? 'flex' : 'hidden md:flex'
        }`}
        aria-label="Conversas com o Agente"
      >
        {/* Header da coluna de histórico */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#CBD6D7] px-4 bg-transparent">
          <div className="flex items-center gap-2">
            {/* Botão de ir direto ao chat se já houver conversa ativa ou para fechar a gaveta no celular */}
            <button
              type="button"
              onClick={() => setMobileView('chat')}
              className="flex md:hidden h-8 w-8 items-center justify-center rounded-lg text-[#5F6D7C] hover:bg-[#F0F4F3]"
              aria-label="Ir para o chat"
              title="Voltar para a conversa"
            >
              <AppIcons.arrowLeft className="h-4 w-4" />
            </button>
            <div>
              <strong className="text-xs font-bold text-[#353B47] uppercase tracking-wide">
                Agente IA
              </strong>
              <p className="text-[10px] text-[#89919A]">Workflow & Ações Zernio</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleStartNewChat}
            className="h-8 border-[#CBD6D7] text-xs font-medium text-[#464B5F] hover:bg-[#F2F7F6]"
            title="Iniciar nova conversa"
          >
            <AppIcons.plus className="mr-1 h-3.5 w-3.5 text-[#10B981]" />
            Nova
          </Button>
        </div>

        {/* Resumo rápido do escopo multi-tenant */}
        <div className="shrink-0 border-b border-[#E8EFF0] bg-[#F7FAFA] px-3.5 py-2 text-[11px] text-[#637080] flex items-center justify-between">
          <span>
            <span className="font-semibold text-[#353B47]">{conversations.length}</span> conversas
            ativas
          </span>
          <span className="text-[10px] text-violet-700 font-semibold bg-violet-100/70 px-1.5 py-0.5 rounded">
            Multi-tenant
          </span>
        </div>

        {/* Lista de sessões anteriores */}
        <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
          {loadingList ? (
            <div className="py-8 flex flex-col items-center justify-center gap-2 text-xs text-[#8F98A3]">
              <AppIcons.spinner className="h-4 w-4 animate-spin text-[#8B5CF6]" />
              <span>Carregando conversas...</span>
            </div>
          ) : conversationsList.length === 0 ? (
            <div className="p-6 text-center text-xs text-[#8A929C]">
              <AppIcons.chatBubble className="mx-auto mb-2 h-6 w-6 text-[#A0AEC0]" />
              <p className="font-semibold text-[#464B5F]">Nenhuma conversa anterior</p>
              <p className="mt-1 text-[11px]">
                Faça sua primeira pergunta sobre contatos ou proponha um template.
              </p>
            </div>
          ) : (
            conversationsList.map((item) => {
              const isActive = item.id === activeConversationId
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectSession(item.id)}
                  className={`w-full text-left rounded-xl px-3 py-2.5 transition-all text-xs ${
                    isActive
                      ? 'bg-white ring-1 ring-[#CBD6D7] shadow-xs font-semibold text-[#353B47]'
                      : 'hover:bg-white text-[#647180]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <AppIcons.messageMore
                      className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-[#8B5CF6]' : 'text-[#9AA5B1]'}`}
                    />
                    <span className="truncate flex-1">{item.title || 'Conversa com Agente'}</span>
                  </div>
                  <span className="mt-1 block text-[10px] text-[#9AA5B1] font-normal">
                    {new Date(item.updated || item.created).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </button>
              )
            })
          )}
        </div>
      </section>

      {/* 3. COLUNA PRINCIPAL: CHAT CONVERSACIONAL COM WORKFLOW E STREAMING (Tela inteira no mobile) */}
      <main
        className={`relative z-10 flex-1 min-w-0 min-h-0 flex-col overflow-hidden bg-white/40 backdrop-blur-sm ${
          mobileView === 'chat' ? 'flex' : 'hidden md:flex'
        }`}
        aria-label="Área de conversa com o Agente"
      >
        {/* Header do Chat: Compacto no mobile (< md) */}
        <header className="flex h-12 sm:h-14 shrink-0 items-center justify-between border-b border-[#CBD6D7]/80 bg-white/95 px-3 sm:px-6">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* Botão de voltar (←) para a lista de sessões no celular */}
            <button
              type="button"
              onClick={() => setMobileView('list')}
              className="flex md:hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#5F6D7C] hover:bg-[#F0F4F3] border border-[#CBD6D7]/60"
              aria-label="Voltar para a lista de sessões"
              title="Voltar para sessões"
            >
              <AppIcons.arrowLeft className="h-4 w-4" />
            </button>

            <AgentOrb
              size={28}
              state={isStreaming ? 'thinking' : 'idle'}
              className="drop-shadow-xs shrink-0 sm:hidden"
              preferWebGL={true}
            />
            <AgentOrb
              size={32}
              state={isStreaming ? 'thinking' : 'idle'}
              className="drop-shadow-xs shrink-0 hidden sm:block"
              preferWebGL={true}
            />
            <div className="min-w-0">
              <h2 className="text-xs sm:text-sm font-bold text-[#353B47] truncate">
                Assistente de Conversas
              </h2>
              {/* Descrição longa escondida no mobile para economizar altura vertical */}
              <p className="hidden md:block text-[11px] text-[#7E8896] truncate">
                Análise com streaming, visualização de tool calls e prévia fiel de templates para
                aprovação.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={handleStartNewChat}
              className="h-8 border-[#CBD6D7] px-2 sm:px-2.5 text-xs text-[#637080] hover:text-[#353B47] hover:bg-[#F2F7F6]"
              title="Iniciar nova conversa"
            >
              <AppIcons.plus className="h-3.5 w-3.5 text-[#10B981] sm:mr-1" />
              <span className="hidden sm:inline">Nova conversa</span>
              <span className="sm:hidden text-[11px] font-medium">Nova</span>
            </Button>
          </div>
        </header>

        {/* Área de Mensagens */}
        <div className="flex-1 min-w-0 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain p-2.5 sm:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-3xl min-w-0 space-y-4">
            {/* Banner de Propostas Pendentes que sobreviveram a reload */}
            {unattachedPendingProposals.length > 0 && (
              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-900 bg-amber-50/90 border border-amber-200 p-2.5 rounded-xl">
                  <AppIcons.warningCircle className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>
                    Você tem {unattachedPendingProposals.length} proposta(s) aguardando sua
                    validação (Aprovo / Não aprovo):
                  </span>
                </div>
                {unattachedPendingProposals.map((action) => (
                  <ActionProposalCard
                    key={action.id}
                    action={action}
                    onActionUpdated={handleActionUpdated}
                    onRejectFeedback={handleRejectFeedback}
                  />
                ))}
              </div>
            )}

            {messages.length === 0 &&
            !loadingMessages &&
            unattachedPendingProposals.length === 0 ? (
              <div className="py-10 text-center">
                <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-tr from-[#8B5CF6]/10 to-[#6366F1]/20 text-[#7C3AED] ring-1 ring-violet-200">
                  <AppIcons.moduleAgent className="h-7 w-7" />
                </div>
                <h3 className="text-base font-bold text-[#353B47]">
                  Como posso ajudar nas suas conversas e ações Zernio?
                </h3>
                <p className="mt-1 text-xs text-[#717C8A] max-w-md mx-auto">
                  Pergunte sobre seus contatos ou peça para criar templates e disparar mensagens.
                  Toda ação externa gera uma prévia fiel do WhatsApp para você aprovar antes da
                  execução.
                </p>

                {/* Sugestões de perguntas rápidas */}
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-xl mx-auto text-left">
                  {QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => void handleSendMessage(prompt)}
                      className="group flex items-start gap-2.5 rounded-xl border border-[#CBD6D7] bg-white p-3 text-xs text-[#464B5F] shadow-2xs hover:border-[#8B5CF6] hover:bg-[#FDFBFF] hover:text-[#7C3AED] transition-all"
                    >
                      <AppIcons.aiSparkle className="h-4 w-4 shrink-0 text-[#8B5CF6] mt-0.5" />
                      <span className="leading-snug">{prompt}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {loadingMessages && (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-[#8F98A3]">
                <AppIcons.spinner className="h-5 w-5 animate-spin text-[#8B5CF6]" />
                <span>Carregando mensagens da conversa...</span>
              </div>
            )}

            {messages.map((msg, index) => {
              const isUser = msg.role === 'user'
              const isLastAssistant = !isUser && index === messages.length - 1

              return (
                <div
                  key={msg.id}
                  className={`flex items-start gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser && (
                    <div className="mt-1 shrink-0">
                      {/* Avatares repetidos usam preferWebGL={false} (Canvas 2D CPU compartilhado)
                          para não esgotar o limite estrito de contextos WebGL do navegador (~16) */}
                      <AgentOrb
                        size={32}
                        state={isLastAssistant && isStreaming ? 'thinking' : 'idle'}
                        preferWebGL={false}
                      />
                    </div>
                  )}

                  <div
                    className={`rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 text-xs leading-relaxed max-w-[96%] sm:max-w-[85%] shadow-2xs min-w-0 ${
                      isUser
                        ? 'bg-[#464B5F] text-white font-medium rounded-tr-xs'
                        : 'border border-[#DCE4E4] bg-white text-[#353B47] rounded-tl-xs overflow-hidden'
                    }`}
                  >
                    {/* Tool calls em tempo real durante o streaming nesta mensagem */}
                    {!isUser && isLastAssistant && isStreaming && activeToolCalls.length > 0 && (
                      <ToolCallsView toolCalls={activeToolCalls} isStreaming={true} />
                    )}

                    {/* Tool calls já concluídas salvas na mensagem */}
                    {!isUser && msg.toolCalls && msg.toolCalls.length > 0 && (
                      <ToolCallsView toolCalls={msg.toolCalls} isStreaming={false} />
                    )}

                    {/* Conteúdo textual da mensagem com markdown rico */}
                    {msg.content ? (
                      isUser ? (
                        <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                      ) : (
                        <AgentMarkdown content={msg.content} />
                      )
                    ) : (
                      // Indicador de "pensando" com liquid orb em estado thinking
                      <div className="flex items-center gap-2.5 py-1 text-xs text-[#8A929C]">
                        <AgentOrb size={18} state="thinking" preferWebGL={true} />
                        <span className="flex gap-1 items-center">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#1EC8FF] animate-bounce [animation-delay:-0.3s]" />
                          <span className="h-1.5 w-1.5 rounded-full bg-[#0756B8] animate-bounce [animation-delay:-0.15s]" />
                          <span className="h-1.5 w-1.5 rounded-full bg-[#168DFF] animate-bounce" />
                        </span>
                        <ShinyText
                          text={toolStatus || 'Consultando conversas…'}
                          color="#7E8896"
                          shineColor="#1EC8FF"
                          speed={1.5}
                        />
                      </div>
                    )}

                    {/* Card de RASCUNHO (Fase de Entrevista e Ajustes antes da submissão à Meta) */}
                    {!isUser &&
                      msg.draftTemplate &&
                      (!msg.proposals || msg.proposals.length === 0) && (
                        <div className="mt-3 border-t border-black/5 pt-2 min-w-0 max-w-full overflow-hidden">
                          <DraftTemplatePreviewCard
                            draft={msg.draftTemplate}
                            onSendToMeta={handleSendDraftToMeta}
                            onRequestChanges={(feedback) => {
                              if (msg.draftTemplate) {
                                void handleRequestDraftChanges(msg.draftTemplate, feedback)
                              }
                            }}
                            disabled={isStreaming}
                            isSubmitting={submittingDraft}
                          />
                        </div>
                      )}

                    {/* Cards de proposta embutidos na mensagem do assistente (Fase Final com Aprovo / Não aprovo) */}
                    {!isUser &&
                      (() => {
                        // Ações diretamente vinculadas na mensagem
                        const directProposals = msg.proposals || []
                        if (directProposals.length > 0) {
                          return (
                            <div className="mt-3 space-y-2 border-t border-black/5 pt-2 min-w-0 max-w-full overflow-hidden">
                              {directProposals.map((action) => (
                                <ActionProposalCard
                                  key={action.id}
                                  action={action}
                                  onActionUpdated={handleActionUpdated}
                                  onRejectFeedback={handleRejectFeedback}
                                />
                              ))}
                            </div>
                          )
                        }

                        // Fallback inline: se esta é a última mensagem do assistente e menciona explicitamente
                        // que a proposta oficial foi gerada, e temos ações pending_approval do usuário não anexadas
                        const contentLower = (msg.content || '').toLowerCase()
                        const claimsOfficialProposal =
                          contentLower.includes('card de proposta') ||
                          contentLower.includes('proposta oficial') ||
                          contentLower.includes('botão aprovo') ||
                          contentLower.includes('botões aprovo')

                        if (claimsOfficialProposal) {
                          const candidate = allUserActions.find(
                            (a) => a.status === 'pending_approval',
                          )
                          if (candidate) {
                            return (
                              <div className="mt-3 space-y-2 border-t border-black/5 pt-2 min-w-0 max-w-full overflow-hidden">
                                <ActionProposalCard
                                  key={candidate.id}
                                  action={candidate}
                                  onActionUpdated={handleActionUpdated}
                                  onRejectFeedback={handleRejectFeedback}
                                />
                              </div>
                            )
                          }
                        }

                        return null
                      })()}
                  </div>

                  {isUser && (
                    <div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-violet-100 text-xs font-bold text-violet-700 ring-1 ring-violet-200">
                      {(user?.name || user?.email || 'U').slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </div>
              )
            })}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Composer */}
        <footer className="shrink-0 border-t border-[#CBD6D7]/80 bg-white/95 backdrop-blur-md p-4">
          <div className="mx-auto max-w-3xl">
            <div className="flex items-center gap-2 rounded-2xl border border-[#CBD6D7] bg-white p-1.5 shadow-xs focus-within:border-[#8B5CF6] focus-within:ring-2 focus-within:ring-violet-200 transition-all">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isStreaming}
                placeholder="Ex: crie um template para lembrar clientes da consulta, ou quem precisa de resposta?..."
                className="border-0 shadow-none text-xs focus-visible:ring-0 bg-transparent px-3 py-2 text-[#353B47] placeholder:text-[#9AA5B1]"
              />
              <Button
                size="sm"
                onClick={() => void handleSendMessage()}
                disabled={!inputValue.trim() || isStreaming}
                className="h-9 px-4 rounded-xl bg-gradient-to-r from-[#8B5CF6] to-[#6366F1] text-xs font-semibold text-white shadow-xs hover:opacity-95 disabled:opacity-50"
              >
                {isStreaming ? (
                  <AppIcons.spinner className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <AppIcons.send className="mr-1.5 h-3.5 w-3.5" />
                    Enviar
                  </>
                )}
              </Button>
            </div>
            <p className="mt-2 text-center text-[10px] text-[#9AA5B1]">
              O agente entrevista o que falta, mostra o rascunho com exemplo e só submete à Meta
              após sua aprovação.
            </p>
          </div>
        </footer>
      </main>
    </div>
  )
}
