import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppIcons } from '@/lib/icons'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { sanitizeDisplayName } from '@/lib/format'
import { useAuth } from '@/contexts/AuthContext'
import { useCrm } from '@/contexts/CrmContext'
import { useOnboarding } from '@/contexts/OnboardingContext'
import { InboxSidebar } from '@/components/inbox/InboxSidebar'
import {
  formatPhoneNumber,
  getZernioSettings,
  getZernioStatus,
  saveZernioSettings,
  setupZernioWebhook,
  syncZernioConversations,
  testZernioConnection,
  sanitizeWebhookErrorMessage,
  listZernioTemplates,
  createZernioTemplate,
  deleteZernioTemplate,
  type OperationMode,
  type WhatsAppTemplate,
  type TemplateCategory,
  type ZernioAccountItem,
  type ZernioSecretsStatus,
} from '@/services/zernio'
import { ZernioLogo, ZERNIO_REFERRAL_URL } from '@/components/ZernioLogo'

export type SettingsSection =
  | 'zernio-connection'
  | 'connected-numbers'
  | 'secrets-status'
  | 'message-templates'
  | 'webhook-events'
  | 'assistant-preferences'
  | 'account-org'

interface SectionItem {
  id: SettingsSection
  title: string
  subtitle: string
  icon: React.ComponentType<{ className?: string }>
  iconColor: string
  badge?: string
  badgeVariant?: 'success' | 'warning' | 'default'
}

export default function Settings() {
  const { user, logout } = useAuth()
  const {
    refresh,
    refreshZernioSettings,
    zernioSettings,
    syncing: crmSyncing,
    triggerSync,
  } = useCrm()
  const { openWizard } = useOnboarding()
  const navigate = useNavigate()

  // Seção ativa na coluna do meio
  const [activeSection, setActiveSection] = useState<SettingsSection>('zernio-connection')

  // Status & secrets state
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [secretsStatus, setSecretsStatus] = useState<ZernioSecretsStatus>({
    ZERNIO_API_KEY: false,
    ZERNIO_ACCOUNT_ID: false,
    ZERNIO_PHONE_ID: false,
    ZERNIO_WEBHOOK_SECRET: false,
  })
  const [operationMode, setOperationMode] = useState<OperationMode>('read_only')
  const [isConnected, setIsConnected] = useState(false)
  const [lastTestedAt, setLastTestedAt] = useState<string | undefined>()
  const [lastSyncedAt, setLastSyncedAt] = useState<string | undefined>()
  const [testStatusMsg, setTestStatusMsg] = useState<string | undefined>()
  const [realConversationsCount, setRealConversationsCount] = useState<number>(0)

  // Accounts state (todos os números conectados simultaneamente)
  const [availableAccounts, setAvailableAccounts] = useState<ZernioAccountItem[]>([])
  const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null)

  const [savingMode, setSavingMode] = useState(false)
  const [testing, setTesting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [registeringWebhook, setRegisteringWebhook] = useState(false)
  const [webhookFeedback, setWebhookFeedback] = useState<{
    type: 'success' | 'warning' | 'error'
    message: string
  } | null>(null)

  // Webhook URL: URL interna fixa do backend do Skip Cloud onde o webhook da Zernio deve ser entregue,
  // com user_id do usuário atual para isolamento multi-tenant (NÃO usar o domínio de preview, que expira a cada deploy).
  const webhookUrl = `https://atendente-de-whatsapp-04cc6.shrd00.internal.goskip.dev/backend/v1/zernio/webhook${user?.id ? `?user_id=${encodeURIComponent(user.id)}` : ''}`

  // Webhooks registrados retornados da API Zernio
  const [registeredWebhooks, setRegisteredWebhooks] = useState<
    Array<{
      _id?: string
      name?: string
      url?: string
      events?: string[]
      isActive?: boolean
    }>
  >([])

  const loadStatus = useCallback(async () => {
    try {
      const [res, s] = await Promise.all([getZernioStatus(), getZernioSettings()])
      if (res) {
        setSecretsStatus(res.secrets)
        setIsConnected(res.isConnected)
        setOperationMode(res.operationMode || 'read_only')
        setLastTestedAt(res.lastTestedAt)
        setLastSyncedAt(res.lastSyncedAt)
        setTestStatusMsg(res.testStatusMessage)
        setRealConversationsCount(res.realConversationsCount || 0)
        if (res.registeredWebhooks) {
          setRegisteredWebhooks(res.registeredWebhooks)
        }
      }
      if (s) {
        if (!res) {
          setIsConnected(Boolean(s.is_connected))
          setOperationMode(s.operation_mode || 'read_only')
          setLastTestedAt(s.last_tested_at)
          setLastSyncedAt(s.last_synced_at)
          setTestStatusMsg(s.test_status_message)
        }
      }
    } catch {
      try {
        const s = await getZernioSettings()
        if (s) {
          setIsConnected(Boolean(s.is_connected))
          setOperationMode(s.operation_mode || 'read_only')
          setLastTestedAt(s.last_tested_at)
          setLastSyncedAt(s.last_synced_at)
          setTestStatusMsg(s.test_status_message)
        }
      } catch (err) {
        console.error('Falha ao carregar configurações:', err)
      }
    } finally {
      setLoadingStatus(false)
    }
  }, [])

  useEffect(() => {
    void (async () => {
      await loadStatus()
      try {
        const res = await testZernioConnection()
        if (res.connected && res.accounts && res.accounts.length > 0) {
          setAvailableAccounts(res.accounts)
          setIsConnected(true)
        }
      } catch {
        // Ignora erro silencioso no mount
      }
    })()
  }, [loadStatus])

  const handleModeChange = async (newMode: OperationMode) => {
    setSavingMode(true)
    setOperationMode(newMode)
    try {
      await saveZernioSettings({ operation_mode: newMode })
      await refreshZernioSettings()
      toast.success(
        newMode === 'read_write'
          ? 'Modo Envio Assistido ativado com sucesso.'
          : 'Modo Revisão ativado com sucesso.',
      )
    } catch {
      toast.error('Não foi possível atualizar o modo de operação.')
    } finally {
      setSavingMode(false)
    }
  }

  const handleTestConnection = async () => {
    setTesting(true)
    try {
      const res = await testZernioConnection(
        zernioSettings?.zernio_api_key?.trim() || undefined,
        true,
      )
      setIsConnected(res.connected)
      setTestStatusMsg(res.message)
      setLastTestedAt(new Date().toISOString())

      if (res.accounts && res.accounts.length > 0) {
        setAvailableAccounts(res.accounts)
      }

      await refreshZernioSettings()
      await loadStatus()

      if (res.connected) {
        const count = res.accounts?.length || 0
        if (count > 1) {
          toast.success(
            `Conexão aprovada! ${count} números WhatsApp conectados e ativos simultaneamente.`,
          )
        } else {
          toast.success(res.message || 'Conexão validada com sucesso na Zernio!')
        }
      } else {
        toast.error(`Falha na validação: ${res.message}`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha desconhecida no teste de conexão.'
      setIsConnected(false)
      setTestStatusMsg(`Erro: ${msg}`)
      toast.error(`Falha no teste: ${msg}`)
      await loadStatus()
    } finally {
      setTesting(false)
    }
  }

  const handleSyncAccount = async (account?: ZernioAccountItem) => {
    if (user?.email === 'videos@adapta.org') {
      toast.success('Demonstração Alô: conversas locais sincronizadas com sucesso.')
      return
    }

    const isSingle = Boolean(account?.id)
    if (isSingle && account) {
      setSyncingAccountId(account.id)
    } else {
      setSyncing(true)
    }

    try {
      const res = await syncZernioConversations(account?.id)
      setLastSyncedAt(new Date().toISOString())
      setIsConnected(true)
      await refresh()
      await refreshZernioSettings()
      await loadStatus()

      const targetLabel = account
        ? `do número ${account.displayName || account.phoneNumber || account.id}`
        : 'de todos os números'

      if (
        res.isPartial ||
        (res.failedItems &&
          res.failedItems > 0 &&
          res.conversationsSynced &&
          res.conversationsSynced > 0)
      ) {
        const errorDetails =
          Array.isArray(res.errors) && res.errors.length > 0
            ? ` Detalhes: ${res.errors.slice(0, 2).join(' | ')}`
            : ''
        toast.warning(
          `${res.message || `Sincronizadas ${res.conversationsSynced || 0} conversas ${targetLabel} com ${res.failedItems || 0} pendência(s).`}${errorDetails}`,
        )
      } else if (res.success) {
        toast.success(res.message || `Sincronização ${targetLabel} concluída com sucesso!`)
      } else {
        const errorDetails =
          Array.isArray(res.errors) && res.errors.length > 0
            ? ` Detalhes: ${res.errors.slice(0, 2).join(' | ')}`
            : ''
        toast.error(`${res.message || 'Falha ao sincronizar dados da Zernio.'}${errorDetails}`)
      }
    } catch (err: unknown) {
      await refresh()
      await loadStatus()
      const msg = err instanceof Error ? err.message : 'Falha na sincronização.'
      toast.error(`Falha na sincronização: ${msg}`)
    } finally {
      if (isSingle) {
        setSyncingAccountId(null)
      } else {
        setSyncing(false)
      }
    }
  }

  const handleAutoRegisterWebhook = async () => {
    setRegisteringWebhook(true)
    setWebhookFeedback(null)
    try {
      const res = await setupZernioWebhook(zernioSettings?.zernio_api_key?.trim() || undefined)
      if (res.success) {
        const msg = res.alreadyRegistered
          ? 'Webhook já estava cadastrado na Zernio e está ativo ✓'
          : 'Webhook cadastrado na Zernio com sucesso ✓ — teste enviando uma mensagem no WhatsApp!'
        setWebhookFeedback({
          type: 'success',
          message: msg,
        })
        toast.success(msg)
        await loadStatus()
      } else {
        const friendlyMsg = sanitizeWebhookErrorMessage(res.message, res.statusCode)
        const isPermissionIssue = res.code === 'FEATURE_NOT_AVAILABLE' || res.statusCode === 403
        setWebhookFeedback({
          type: isPermissionIssue ? 'warning' : 'error',
          message: friendlyMsg,
        })
        if (isPermissionIssue) {
          toast.warning(friendlyMsg)
        } else {
          toast.error(friendlyMsg)
        }
      }
    } catch (err: unknown) {
      const rawMsg =
        err instanceof Error ? err.message : 'Falha ao conectar com o endpoint de webhook.'
      const friendlyMsg = sanitizeWebhookErrorMessage(rawMsg)
      setWebhookFeedback({
        type: 'error',
        message: friendlyMsg,
      })
      toast.error(friendlyMsg)
    } finally {
      setRegisteringWebhook(false)
    }
  }

  const copyToClipboard = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text)
    toast.success(`${label} copiado para a área de transferência.`)
  }

  const apiKeyConfigured =
    secretsStatus.ZERNIO_API_KEY || Boolean(zernioSettings?.zernio_api_key?.trim())
  const webhookSecretConfigured = secretsStatus.ZERNIO_WEBHOOK_SECRET
  const accountsCount = availableAccounts.length

  // Templates de Mensagem Meta / Zernio
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [creatingTemplate, setCreatingTemplate] = useState(false)
  const [deletingTemplateName, setDeletingTemplateName] = useState<string | null>(null)
  const [newTemplateModalOpen, setNewTemplateModalOpen] = useState(false)

  // Form de criação de template
  const [tplName, setTplName] = useState('')
  const [tplCategory, setTplCategory] = useState<TemplateCategory>('UTILITY')
  const [tplLanguage, setTplLanguage] = useState('pt_BR')
  const [tplBody, setTplBody] = useState('')
  const [tplButtonText, setTplButtonText] = useState('')
  const [tplButtonUrl, setTplButtonUrl] = useState('')
  const [tplButtonUrlExample, setTplButtonUrlExample] = useState('')
  const [tplExamples, setTplExamples] = useState<Record<string, string>>({})

  const loadTemplates = useCallback(async () => {
    setLoadingTemplates(true)
    try {
      const list = await listZernioTemplates()
      setTemplates(list)
    } catch (err) {
      console.warn('Erro ao carregar templates:', err)
    } finally {
      setLoadingTemplates(false)
    }
  }, [])

  useEffect(() => {
    if (activeSection === 'message-templates') {
      void loadTemplates()
    }
  }, [activeSection, loadTemplates])

  // Extrair lista de variáveis detectadas no corpo (ex: {{1}}, {{2}}...)
  const detectedVariables = useMemo(() => {
    const matches = tplBody.match(/\{\{\s*(\d+|\w+)\s*\}\}/g)
    if (!matches) return []
    return matches.map((_, idx) => String(idx + 1))
  }, [tplBody])

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanName = tplName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
    if (!cleanName) {
      toast.error('Informe um nome válido para o template (apenas letras minúsculas e _).')
      return
    }
    if (!tplBody.trim()) {
      toast.error('Informe o corpo da mensagem do template.')
      return
    }

    setCreatingTemplate(true)
    try {
      const buttons = []
      if (tplButtonText.trim()) {
        if (tplButtonUrl.trim()) {
          const btnObj: { type: 'URL'; text: string; url: string; example?: string[] } = {
            type: 'URL',
            text: tplButtonText.trim(),
            url: tplButtonUrl.trim(),
          }
          if (tplButtonUrl.includes('{{1}}') || tplButtonUrl.includes('{{ 1 }}')) {
            if (tplButtonUrlExample.trim()) {
              btnObj.example = [tplButtonUrlExample.trim()]
            }
          }
          buttons.push(btnObj)
        } else {
          buttons.push({
            type: 'QUICK_REPLY' as const,
            text: tplButtonText.trim(),
          })
        }
      }

      const res = await createZernioTemplate({
        name: cleanName,
        category: tplCategory,
        language: tplLanguage,
        body: tplBody.trim(),
        buttons: buttons.length > 0 ? buttons : undefined,
        examples: Object.keys(tplExamples).length > 0 ? tplExamples : undefined,
        buttonUrlExample: tplButtonUrlExample.trim() || undefined,
      })

      if (res.success) {
        toast.success('Template enviado com sucesso para aprovação da Meta!')
        setNewTemplateModalOpen(false)
        setTplName('')
        setTplBody('')
        setTplButtonText('')
        setTplButtonUrl('')
        setTplButtonUrlExample('')
        setTplExamples({})
        await loadTemplates()
      } else {
        toast.error(`Falha ao criar template: ${res.message}`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha na comunicação com a API Zernio.'
      toast.error(msg)
    } finally {
      setCreatingTemplate(false)
    }
  }

  const handleDeleteTemplate = async (templateIdOrName: string) => {
    if (
      !confirm(
        `Tem certeza que deseja excluir o template "${templateIdOrName}" na Zernio e na Meta?`,
      )
    ) {
      return
    }

    setDeletingTemplateName(templateIdOrName)
    try {
      const res = await deleteZernioTemplate(templateIdOrName)
      if (res.success) {
        toast.success(`Template "${templateIdOrName}" excluído com sucesso.`)
        await loadTemplates()
      } else {
        toast.error(`Falha ao excluir template: ${res.message}`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao excluir template.'
      toast.error(msg)
    } finally {
      setDeletingTemplateName(null)
    }
  }

  // Lista estruturada das 7 seções de configuração (Coluna do Meio)
  const sections: SectionItem[] = [
    {
      id: 'zernio-connection',
      title: 'Conexão WhatsApp (Zernio)',
      subtitle: 'Passo a passo da API Key e pareamento oficial',
      icon: AppIcons.key,
      iconColor: 'text-[#3B82F6]',
      badge: apiKeyConfigured ? 'Conectado' : 'Pendente',
      badgeVariant: apiKeyConfigured ? 'success' : 'warning',
    },
    {
      id: 'connected-numbers',
      title: 'Números Conectados',
      subtitle: 'Detecção dos números WhatsApp vinculados',
      icon: AppIcons.phoneDevice,
      iconColor: 'text-[#10B981]',
      badge:
        accountsCount > 0
          ? `${accountsCount} ${accountsCount === 1 ? 'número' : 'números'}`
          : undefined,
      badgeVariant: 'default',
    },
    {
      id: 'secrets-status',
      title: 'Status dos Secrets & Backend',
      subtitle: 'Tabela dos secrets (ZERNIO_API_KEY etc.)',
      icon: AppIcons.lock,
      iconColor: 'text-[#8B5CF6]',
      badge: apiKeyConfigured ? 'Leitura pronta' : 'Ausente',
      badgeVariant: apiKeyConfigured ? 'success' : 'warning',
    },
    {
      id: 'message-templates',
      title: 'Templates de Mensagem',
      subtitle: 'Aprovação da Meta & envio fora da janela 24h',
      icon: AppIcons.template,
      iconColor: 'text-[#10B981]',
      badge: templates.length > 0 ? `${templates.length} templates` : undefined,
      badgeVariant: 'default',
    },
    {
      id: 'webhook-events',
      title: 'Webhook & Eventos',
      subtitle: 'URLs, tempo real e validação HMAC',
      icon: AppIcons.allProfiles,
      iconColor: 'text-[#F97316]',
      badge: registeredWebhooks.length > 0 ? 'Ativo' : undefined,
      badgeVariant: 'success',
    },
    {
      id: 'assistant-preferences',
      title: 'Preferências do Assistente',
      subtitle: 'Modos de operação, alertas e rascunhos',
      icon: AppIcons.aiSparkle,
      iconColor: 'text-[#E5A14C]',
      badge: operationMode === 'read_write' ? 'Envio assistido' : 'Modo revisão',
      badgeVariant: 'default',
    },
    {
      id: 'account-org',
      title: 'Conta e Organização',
      subtitle: 'Dados do usuário e sessão ativa',
      icon: AppIcons.singleProfile,
      iconColor: 'text-[#6B7280]',
    },
  ]

  return (
    <div className="h-full w-full overflow-hidden relative flex bg-slate-900">
      {/* Imagem de fundo azul-gelo da demo da landing sem overlay */}
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage:
            "url('https://res.cloudinary.com/dfrzlhyvi/image/upload/v1789769629/bg-exemplo-2-azul-gelo_bfo81i.png')",
        }}
        aria-hidden="true"
      />

      {/* ========================================================================= */}
      {/* 1. SIDEBAR DE FILAS DA INBOX (Reutilizada, com Configurações ativa)        */}
      {/* ========================================================================= */}
      <InboxSidebar isSettingsPage onSelectQueue={() => navigate('/inbox')} />

      {/* ========================================================================= */}
      {/* 2. COLUNA DO MEIO: LISTA DE SEÇÕES DE CONFIGURAÇÃO (Estilo cartões inbox) */}
      {/* ========================================================================= */}
      <section
        className="relative z-10 flex flex-col border-r border-[#CBD6D7]/80 backdrop-blur-md shrink-0 min-h-0 bg-white/95 w-full md:w-[300px] lg:w-[320px] xl:w-[340px] 2xl:w-[360px]"
        aria-label="Seções de configurações"
      >
        {/* Header da lista de seções */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#CBD6D7] px-4 bg-transparent">
          <div>
            <strong className="text-xs font-bold text-[#353B47] uppercase tracking-wide">
              Configurações
            </strong>
            <p className="text-[10px] text-[#89919A]">Guia de instalação & preferências</p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-[#F0F4F3] px-2 py-0.5 text-[10px] tabular-nums font-semibold text-[#464B5F]">
              {sections.length}
            </span>
          </div>
        </div>

        {/* Lista vertical de seções */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-2 space-y-1.5">
          {sections.map((sec) => {
            const isActive = activeSection === sec.id
            const Icon = sec.icon
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => setActiveSection(sec.id)}
                className={`group flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all ${
                  isActive
                    ? 'border-[#3D5F53] bg-[#EBF7F0]/90 text-[#353B47] shadow-xs ring-1 ring-[#3D5F53]/30'
                    : 'border-[#CBD6D7]/70 bg-white hover:border-[#CBD6D7] hover:bg-[#F8FAFA] text-[#464B5F]'
                }`}
              >
                <div
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border transition-colors ${
                    isActive
                      ? 'border-[#BFDEC9] bg-[#E1F3E7] text-[#2F6B56]'
                      : 'border-[#E2E8E8] bg-[#F4F7F7] text-[#464B5F] group-hover:bg-white'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${sec.iconColor}`} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1.5">
                    <p
                      className={`truncate text-xs font-bold ${
                        isActive ? 'text-[#204437]' : 'text-[#353B47]'
                      }`}
                    >
                      {sec.title}
                    </p>
                    {sec.badge && (
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.2 text-[9px] font-bold tabular-nums ${
                          sec.badgeVariant === 'success'
                            ? 'bg-[#EAF7F1] text-[#2F6B56] border border-[#BDE3D5]'
                            : sec.badgeVariant === 'warning'
                              ? 'bg-[#FEF6F5] text-[#C55348] border border-[#F2D6D3]'
                              : 'bg-[#EDF2F1] text-[#464B5F] border border-[#DCE4E4]'
                        }`}
                      >
                        {sec.badge}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-[#7A838D]">
                    {sec.subtitle}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. PAINEL DA DIREITA: CONTEÚDO DA SEÇÃO SELECIONADA                       */}
      {/* ========================================================================= */}
      <main
        className="relative z-10 flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden bg-white/40"
        aria-label="Painel de configuração detalhado"
      >
        {/* Header persistente no topo do painel: Wizard + Status de Conexão + Sincronizar */}
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[#CBD6D7]/80 bg-white/95 backdrop-blur-md px-4 sm:px-6">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="truncate text-sm font-bold text-[#353B47]">
              {sections.find((s) => s.id === activeSection)?.title || 'Configurações'}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => openWizard(1)}
              className="border-[#CBD6D7] bg-white text-xs font-semibold text-[#464B5F] hover:bg-[#FBFBFB] shadow-xs h-8"
            >
              <AppIcons.aiSparkle className="mr-1.5 h-3.5 w-3.5 text-[#3B82F6]" />
              <span className="hidden sm:inline">Assistente de configuração (Wizard)</span>
              <span className="sm:hidden">Wizard</span>
            </Button>

            {isConnected ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-[#CBD6D7] bg-white px-3 py-1 text-xs font-medium text-[#464B5F] h-8">
                <span className="h-2 w-2 rounded-full bg-[#3FB980]" />
                <span className="hidden sm:inline">
                  {accountsCount > 1
                    ? `${accountsCount} números conectados`
                    : accountsCount === 1
                      ? '1 número conectado'
                      : 'WhatsApp Zernio Conectado'}
                </span>
                <span className="sm:hidden">Conectado</span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 rounded-full border border-[#CBD6D7] bg-white px-3 py-1 text-xs font-medium text-[#7A838D] h-8">
                <span className="h-2 w-2 rounded-full bg-[#A3A5AF]" />
                <span className="hidden sm:inline">Instalação Pendente</span>
                <span className="sm:hidden">Pendente</span>
              </div>
            )}

            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                void loadStatus()
                void triggerSync()
              }}
              disabled={loadingStatus || crmSyncing}
              className="h-8 w-8 border-[#CBD6D7] bg-white text-[#464B5F] hover:bg-[#FBFBFB]"
              title="Recarregar status do backend e sincronizar"
              aria-label="Sincronizar configurações"
            >
              <AppIcons.sync
                className={`h-3.5 w-3.5 ${loadingStatus || crmSyncing ? 'animate-spin' : ''}`}
              />
            </Button>
          </div>
        </header>

        {/* Conteúdo rolável da seção selecionada com largura ótima de leitura */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain bg-white/45 backdrop-blur-xs p-4 sm:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-3xl space-y-6">
            {/* ----------------------------------------------------------------- */}
            {/* SEÇÃO 1: CONEXÃO WHATSAPP (ZERNIO API KEY)                        */}
            {/* ----------------------------------------------------------------- */}
            {activeSection === 'zernio-connection' && (
              <div className="space-y-6">
                <div className="rounded-xl border border-[#CBD6D7] bg-white p-6 sm:p-7 shadow-xs">
                  <div className="border-b border-[#CBD6D7] pb-5">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="inline-flex items-center rounded-md border border-[#CBD6D7] bg-[#FBFBFB] px-2.5 py-0.5 text-[11px] font-semibold tracking-wider text-[#464B5F]">
                        ONBOARDING OFICIAL
                      </span>
                      <span className="text-xs text-[#A3A5AF]">•</span>
                      <span className="text-xs font-medium text-[#7A838D]">
                        WhatsApp Business API
                      </span>
                    </div>
                    <h2 className="mt-3 text-lg font-bold tracking-tight text-[#464B5F] sm:text-xl">
                      Como instalar a conexão WhatsApp (Zernio API)
                    </h2>
                    <p className="mt-2 text-xs leading-relaxed text-[#7A838D] sm:text-sm">
                      Por segurança, a chave mestra não fica na tela nem no banco. É gerenciada
                      exclusivamente como{' '}
                      <strong className="font-semibold text-[#464B5F]">
                        Secret ZERNIO_API_KEY
                      </strong>{' '}
                      (a única credencial real necessária) no backend. A chave única enxerga toda a
                      sua conta Zernio e sincroniza todos os seus números de WhatsApp
                      simultaneamente na mesma inbox com filtros rápidos.
                    </p>

                    {!apiKeyConfigured && (
                      <div className="mt-4 rounded-xl border border-[#CBD6D7] bg-[#FDF8F0] p-4 text-xs">
                        <div className="flex items-start gap-3">
                          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#F8EEDD] text-[#A4671E]">
                            <AppIcons.aiSparkle className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-[#464B5F]">
                                Primeira instalação: Comece configurando sua chave
                              </span>
                              <span className="rounded bg-[#F0DFC6] px-1.5 py-0.5 text-[10px] font-semibold text-[#A4671E]">
                                PASSO A PASSO
                              </span>
                            </div>
                            <ol className="mt-2 space-y-1 list-decimal list-inside text-[#464B5F]">
                              <li>
                                Acesse sua conta na <strong>Zernio</strong> e copie sua API Key no
                                painel.
                              </li>
                              <li>
                                No Skip Cloud, acesse os Secrets do backend e cadastre a chave como{' '}
                                <code className="rounded bg-white px-1 py-0.2 font-mono text-[11px] border border-[#CBD6D7]">
                                  ZERNIO_API_KEY
                                </code>
                                .
                              </li>
                              <li>
                                Volte aqui e clique em <strong>"Atualizar detecção"</strong> na
                                seção "Números Conectados" para carregar seus números de WhatsApp.
                              </li>
                            </ol>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Passo 1 detalhado */}
                  <div className="mt-6 rounded-xl border border-[#CBD6D7] bg-[#FBFBFB] p-5">
                    <div className="flex items-start gap-4">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#464B5F] text-xs font-semibold text-white">
                        1
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-semibold text-[#464B5F]">
                              Crie sua conta na Zernio e copie a API Key
                            </h3>
                            {apiKeyConfigured ? (
                              <span className="inline-flex items-center gap-1 rounded border border-[#BDE3D5] bg-[#F1FAF7] px-2 py-0.5 text-[10px] font-semibold text-[#2F6B56]">
                                <AppIcons.checkCircle className="h-3 w-3 text-[#3FB980]" /> Chave
                                cadastrada
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded border border-[#F2D6D3] bg-[#FEF6F5] px-2 py-0.5 text-[10px] font-semibold text-[#C55348]">
                                <AppIcons.warningCircle className="h-3 w-3 text-[#C55348]" /> Chave
                                pendente
                              </span>
                            )}
                          </div>
                          <a
                            href={ZERNIO_REFERRAL_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex w-fit items-center gap-2 rounded-lg border border-[#CBD6D7] bg-white px-3 py-1.5 text-xs font-medium text-[#464B5F] hover:border-[#2C8A55] hover:bg-[#F4F7F7] hover:text-[#2C8A55] transition-colors shadow-2xs"
                            title="Acessar painel Zernio em nova aba"
                          >
                            <span>Acessar</span>
                            <ZernioLogo height={14} raw className="translate-y-[0.5px]" />
                            <AppIcons.externalLink className="h-3 w-3 text-[#A3A5AF]" />
                          </a>
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-[#7A838D]">
                          A <strong className="font-semibold text-[#464B5F]">Zernio</strong> fornece
                          a camada oficial sobre a WhatsApp Business API (Meta Cloud API). Crie sua
                          conta, conecte seu(s) número(s) WhatsApp Business e gere sua chave de API
                          (Bearer Token) no painel da Zernio.
                        </p>

                        {!apiKeyConfigured && (
                          <div className="mt-3.5 flex items-start gap-2.5 rounded-lg border border-[#F2D6D3] bg-[#FEF6F5] p-3 text-xs text-[#C55348]">
                            <AppIcons.warningCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#C55348]" />
                            <div className="leading-relaxed">
                              <strong className="font-semibold">
                                Roteiro de primeira instalação:
                              </strong>{' '}
                              Após copiar sua chave na Zernio, cadastre o secret{' '}
                              <code className="rounded border border-[#F2D6D3] bg-white px-1 py-0.2 font-mono font-bold text-[#C55348]">
                                ZERNIO_API_KEY
                              </code>{' '}
                              no ambiente do backend. Isso liberará o teste de conexão e a detecção
                              automática de todos os seus números de WhatsApp.
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Ações de teste rápido */}
                  <div className="mt-6 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[#CBD6D7]">
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleTestConnection}
                        disabled={testing || !apiKeyConfigured}
                        className="border-[#CBD6D7] bg-white text-xs font-medium text-[#464B5F] hover:bg-[#F4F7F7]"
                      >
                        {testing ? (
                          <>
                            <AppIcons.spinner className="mr-2 h-3.5 w-3.5 animate-spin" />
                            Testando conexão...
                          </>
                        ) : (
                          <>
                            <AppIcons.key className="mr-1.5 h-3.5 w-3.5 text-[#7A838D]" />
                            Testar conexão agora
                          </>
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setActiveSection('connected-numbers')}
                        className="bg-[#464B5F] text-white hover:bg-[#383C4C] text-xs font-medium"
                      >
                        Ver números conectados →
                      </Button>
                    </div>

                    {lastTestedAt && (
                      <p className="text-[11px] text-[#A3A5AF]">
                        Último teste: {new Date(lastTestedAt).toLocaleString('pt-BR')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ----------------------------------------------------------------- */}
            {/* SEÇÃO 2: NÚMEROS CONECTADOS                                       */}
            {/* ----------------------------------------------------------------- */}
            {activeSection === 'connected-numbers' && (
              <div className="space-y-6">
                <div className="rounded-xl border border-[#CBD6D7] bg-white p-6 sm:p-7 shadow-xs">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-[#CBD6D7] pb-5">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-bold text-[#464B5F] sm:text-lg">
                          Números conectados de WhatsApp
                        </h2>
                        {availableAccounts.length > 0 && (
                          <span className="inline-flex items-center gap-1 rounded border border-[#BDE3D5] bg-[#F1FAF7] px-2 py-0.5 text-[10px] font-semibold text-[#2F6B56]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#3FB980]" />
                            {availableAccounts.length}{' '}
                            {availableAccounts.length === 1
                              ? 'número ativo'
                              : 'números ativos simultaneamente'}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-[#7A838D]">
                        Gerenciamento de contas e instâncias detectadas pela Zernio API.
                      </p>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleTestConnection}
                      disabled={testing || !apiKeyConfigured}
                      className="w-fit border-[#CBD6D7] bg-white text-xs font-medium text-[#464B5F] hover:bg-[#F4F7F7] disabled:opacity-50"
                      title={
                        !apiKeyConfigured
                          ? 'Cadastre a ZERNIO_API_KEY no Skip Cloud antes de testar'
                          : 'Consultar números ativos na conta Zernio'
                      }
                    >
                      {testing ? (
                        <>
                          <AppIcons.spinner className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          Detectando números...
                        </>
                      ) : (
                        <>
                          <AppIcons.sync className="mr-1.5 h-3.5 w-3.5 text-[#7A838D]" />
                          Atualizar detecção
                        </>
                      )}
                    </Button>
                  </div>

                  <p className="mt-4 text-xs leading-relaxed text-[#7A838D]">
                    A sua{' '}
                    <code className="rounded border border-[#CBD6D7] bg-[#FBFBFB] px-1 py-0.2 font-mono text-[11px] text-[#464B5F]">
                      ZERNIO_API_KEY
                    </code>{' '}
                    enxerga toda a sua conta. Todos os números detectados abaixo operam de forma{' '}
                    <strong className="font-semibold text-[#464B5F]">simultânea</strong> na mesma
                    inbox — você não precisa vincular apenas um nem alternar de número para receber
                    e atender conversas. Na inbox, você pode filtrar facilmente por número usando os
                    seletores rápidos.
                  </p>

                  {/* Listagem dos números */}
                  {availableAccounts.length > 0 ? (
                    <div className="mt-5 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#7A838D]">
                          Números detectados na conta Zernio ({availableAccounts.length}):
                        </p>
                        <span className="text-[11px] text-[#7A838D]">
                          Todos ativos e sincronizados juntos
                        </span>
                      </div>

                      <div className="divide-y divide-[#CBD6D7] overflow-hidden rounded-xl border border-[#CBD6D7] bg-white">
                        {availableAccounts.map((account) => {
                          const isSyncingThis = syncingAccountId === account.id
                          const rawPhone = account.phoneNumber || account.username || ''
                          const formatted = formatPhoneNumber(rawPhone)

                          return (
                            <div
                              key={account.id}
                              className="flex flex-col gap-3 p-4 transition-colors sm:flex-row sm:items-center sm:justify-between bg-white hover:bg-[#FBFBFB]"
                            >
                              <div className="flex items-start sm:items-center gap-3 min-w-0">
                                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[#BDE3D5] bg-[#EBF7F2] text-[#2F6B56]">
                                  <AppIcons.phoneDevice className="h-4 w-4" />
                                </div>

                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="truncate text-xs font-bold text-[#464B5F]">
                                      {account.displayName || account.profileName || 'WhatsApp'}
                                    </span>
                                    <span className="inline-flex items-center gap-1 rounded border border-[#BDE3D5] bg-[#F1FAF7] px-2 py-0.5 text-[10px] font-semibold text-[#2F6B56]">
                                      <AppIcons.check className="h-3 w-3 text-[#3FB980]" />{' '}
                                      Conectado
                                    </span>
                                  </div>

                                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                                    {formatted ? (
                                      <span className="font-mono text-xs font-semibold text-[#464B5F]">
                                        {formatted}
                                      </span>
                                    ) : null}
                                    <span className="text-[11px] text-[#A3A5AF] font-mono">
                                      ID: {account.id}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 self-end sm:self-center">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => void handleSyncAccount(account)}
                                  disabled={isSyncingThis || syncing}
                                  className="border-[#CBD6D7] bg-white text-xs font-medium text-[#464B5F] hover:bg-[#F4F7F7]"
                                  title={`Sincronizar conversas exclusivas de ${account.displayName || formatted || account.id}`}
                                >
                                  {isSyncingThis ? (
                                    <>
                                      <AppIcons.spinner className="mr-1.5 h-3 w-3 animate-spin" />
                                      Sincronizando...
                                    </>
                                  ) : (
                                    <>
                                      <AppIcons.sync className="mr-1.5 h-3 w-3 text-[#7A838D]" />
                                      Sincronizar este número
                                    </>
                                  )}
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-lg border border-[#CBD6D7] bg-[#FBFBFB] p-4 text-xs text-[#7A838D]">
                      <div className="flex items-start gap-2.5">
                        <AppIcons.info className="mt-0.5 h-4 w-4 shrink-0 text-[#464B5F]" />
                        <div className="space-y-1.5">
                          <p className="leading-relaxed">
                            {apiKeyConfigured ? (
                              <>
                                Sua{' '}
                                <strong className="font-semibold text-[#464B5F]">
                                  ZERNIO_API_KEY
                                </strong>{' '}
                                já está configurada! Clique no botão{' '}
                                <strong className="font-semibold text-[#464B5F]">
                                  "Atualizar detecção"
                                </strong>{' '}
                                acima para listar seus números de WhatsApp conectados na conta.
                              </>
                            ) : (
                              <>
                                <strong className="font-semibold text-[#C55348]">Atenção:</strong>{' '}
                                Cadastre a variável de ambiente{' '}
                                <code className="rounded border border-[#CBD6D7] bg-white px-1 py-0.5 font-mono text-[11px] text-[#464B5F]">
                                  ZERNIO_API_KEY
                                </code>{' '}
                                no Skip Cloud antes de clicar em atualizar a detecção.
                              </>
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-[#CBD6D7] bg-[#FBFBFB] px-3.5 py-2.5 text-xs text-[#7A838D]">
                    <AppIcons.phoneDevice className="h-4 w-4 shrink-0 text-[#464B5F]" />
                    <span className="flex-1">
                      Todos os números conectados são sincronizados e monitorados em paralelo. Na
                      inbox, você pode alternar a visualização pelos botões de filtro ou visualizar
                      todas as conversas unificadas.
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* ----------------------------------------------------------------- */}
            {/* SEÇÃO 3: STATUS DOS SECRETS NO BACKEND                           */}
            {/* ----------------------------------------------------------------- */}
            {activeSection === 'secrets-status' && (
              <div className="space-y-6">
                <div className="rounded-xl border border-[#CBD6D7] bg-white p-6 sm:p-7 shadow-xs">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-[#CBD6D7] pb-5">
                    <div>
                      <h2 className="text-base font-bold text-[#464B5F] sm:text-lg">
                        Status dos Secrets no backend
                      </h2>
                      <p className="mt-1 text-xs text-[#7A838D]">
                        Variáveis de ambiente criptografadas gerenciadas no servidor.
                      </p>
                    </div>

                    <div>
                      {apiKeyConfigured ? (
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-[#BDE3D5] bg-[#F1FAF7] px-2.5 py-1 text-xs font-medium text-[#2F6B56]">
                          <AppIcons.checkCircle className="h-3.5 w-3.5 text-[#3FB980]" />
                          Pronto para leitura
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-[#F2D6D3] bg-[#FEF6F5] px-2.5 py-1 text-xs font-medium text-[#C55348]">
                          <AppIcons.closeCircle className="h-3.5 w-3.5 text-[#C55348]" />
                          ZERNIO_API_KEY faltando
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="mt-4 text-xs leading-relaxed text-[#7A838D]">
                    Para ler e priorizar conversas, apenas a{' '}
                    <strong className="font-semibold text-[#464B5F]">ZERNIO_API_KEY</strong> é
                    estritamente necessária. Os demais secrets são adicionais para automações de
                    webhook e envio assistido:
                  </p>

                  {/* Tabela de status dos secrets com hierarquia clara */}
                  <div className="mt-4 overflow-hidden rounded-lg border border-[#CBD6D7] bg-white">
                    <div className="grid grid-cols-12 items-center border-b border-[#CBD6D7] bg-[#FBFBFB] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#7A838D]">
                      <div className="col-span-12 sm:col-span-4">Nome & Classificação</div>
                      <div className="col-span-8 sm:col-span-5">Finalidade & Papel</div>
                      <div className="col-span-4 sm:col-span-3 text-right">Status Atual</div>
                    </div>

                    <SecretRow
                      name="ZERNIO_API_KEY"
                      badgeType="required"
                      microtext="Única credencial real necessária. Uma chave por conta Zernio enxerga todos os seus números de WhatsApp conectados."
                      configured={secretsStatus.ZERNIO_API_KEY}
                      onCopy={() => void copyToClipboard('ZERNIO_API_KEY', 'Nome da chave')}
                    />
                    <SecretRow
                      name="ZERNIO_ACCOUNT_ID"
                      badgeType="optional"
                      microtext="Identificador, não credencial. O app detecta a conta automaticamente pela chave e permite vincular o número no Passo 2."
                      configured={secretsStatus.ZERNIO_ACCOUNT_ID}
                      onCopy={() => void copyToClipboard('ZERNIO_ACCOUNT_ID', 'Nome da chave')}
                    />
                    <SecretRow
                      name="ZERNIO_PHONE_ID"
                      badgeType="optional"
                      microtext="Para envio de mensagens, o app utiliza o ID do número da própria conversa, não necessitando de um ID fixo no ambiente."
                      configured={secretsStatus.ZERNIO_PHONE_ID}
                      onCopy={() => void copyToClipboard('ZERNIO_PHONE_ID', 'Nome da chave')}
                    />
                    <SecretRow
                      name="ZERNIO_WEBHOOK_SECRET"
                      badgeType="recommended"
                      microtext="Valida a assinatura criptográfica (HMAC) das mensagens recebidas em tempo real diretamente da Zernio."
                      configured={secretsStatus.ZERNIO_WEBHOOK_SECRET}
                      onCopy={() => void copyToClipboard('ZERNIO_WEBHOOK_SECRET', 'Nome da chave')}
                    />
                  </div>

                  <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-[#CBD6D7] bg-[#FBFBFB] p-3 text-xs text-[#7A838D]">
                    <AppIcons.lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#464B5F]" />
                    <span>
                      <strong className="font-semibold text-[#464B5F]">Segurança:</strong> Como sua{' '}
                      <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px] text-[#464B5F] border border-[#CBD6D7]">
                        ZERNIO_API_KEY
                      </code>{' '}
                      já está salva nos secrets do backend, você já pode testar e sincronizar as
                      conversas reais de imediato.
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* ----------------------------------------------------------------- */}
            {/* SEÇÃO: TEMPLATES DE MENSAGEM (META / ZERNIO)                      */}
            {/* ----------------------------------------------------------------- */}
            {activeSection === 'message-templates' && (
              <div className="space-y-6">
                <div className="rounded-xl border border-[#CBD6D7] bg-white p-6 sm:p-7 shadow-xs">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#CBD6D7] pb-5">
                    <div>
                      <h2 className="text-base font-bold text-[#464B5F] sm:text-lg flex items-center gap-2">
                        Templates de Mensagem WhatsApp
                        <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                          Meta Cloud API
                        </span>
                      </h2>
                      <p className="mt-1 text-xs text-[#7A838D]">
                        Crie e gerencie templates aprovados pela Meta para iniciar conversas ativas
                        ou responder fora da janela de 24h.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void loadTemplates()}
                        disabled={loadingTemplates}
                        className="border-[#CBD6D7] bg-white text-xs font-medium text-[#464B5F] hover:bg-[#F4F7F7]"
                      >
                        <AppIcons.sync
                          className={`mr-1.5 h-3.5 w-3.5 text-[#7A838D] ${loadingTemplates ? 'animate-spin' : ''}`}
                        />
                        Atualizar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setNewTemplateModalOpen(true)}
                        className="bg-[#10B981] hover:bg-[#059669] text-white text-xs font-semibold shadow-xs"
                      >
                        <AppIcons.plus className="mr-1.5 h-3.5 w-3.5" />
                        Criar template
                      </Button>
                    </div>
                  </div>

                  {/* Orientações sobre a janela de 24h */}
                  <div className="mt-5 rounded-lg border border-[#BDE3D5] bg-[#F1FAF7] p-3.5 text-xs text-[#2F6B56]">
                    <div className="flex items-start gap-2.5">
                      <AppIcons.shieldSafe className="mt-0.5 h-4 w-4 shrink-0 text-[#3FB980]" />
                      <div className="leading-relaxed">
                        <strong className="font-semibold">
                          Como funciona o envio fora da janela de 24h:
                        </strong>
                        <p className="mt-0.5 text-[11px]">
                          Pela política da Meta, após 24 horas da última mensagem do lead, o envio
                          de texto livre fica restrito. Para retomar a conversa, você seleciona um
                          template com status{' '}
                          <strong className="font-semibold text-emerald-800">APROVADO</strong>,
                          preenche as variáveis dinâmicas (ex:{' '}
                          <code className="bg-emerald-100/70 px-1 py-0.2 rounded font-mono">
                            {'{{1}}'}
                          </code>
                          ) e dispara a mensagem oficialmente.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Listagem de Templates */}
                  <div className="mt-6">
                    {loadingTemplates ? (
                      <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-[#8F98A3]">
                        <AppIcons.spinner className="h-5 w-5 animate-spin text-[#10B981]" />
                        <span>Consultando templates na Zernio / Meta...</span>
                      </div>
                    ) : templates.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-[#CBD6D7] p-8 text-center">
                        <AppIcons.template className="mx-auto mb-2 h-8 w-8 text-[#A0AEC0]" />
                        <h4 className="text-sm font-semibold text-[#464B5F]">
                          Nenhum template cadastrado
                        </h4>
                        <p className="mt-1 text-xs text-[#8A929C] max-w-sm mx-auto">
                          Clique em &quot;Criar template&quot; para submeter seu primeiro modelo à
                          aprovação da Meta.
                        </p>
                        <Button
                          size="sm"
                          onClick={() => setNewTemplateModalOpen(true)}
                          className="mt-4 bg-[#10B981] hover:bg-[#059669] text-white text-xs"
                        >
                          <AppIcons.plus className="mr-1.5 h-3.5 w-3.5" />
                          Criar meu primeiro template
                        </Button>
                      </div>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {templates.map((tpl) => {
                          const status = (tpl.status || 'PENDING').toUpperCase()
                          const isApproved = status === 'APPROVED'
                          const isRejected = status === 'REJECTED'
                          const isPending = !isApproved && !isRejected

                          // Extrair texto do corpo dos components
                          const bodyComp = tpl.components?.find(
                            (c) => (c.type || '').toUpperCase() === 'BODY',
                          )
                          const bodyPreview =
                            bodyComp?.text || tpl.body || 'Sem pré-visualização de texto'
                          const buttonsComp = tpl.components?.find(
                            (c) => (c.type || '').toUpperCase() === 'BUTTONS',
                          )

                          return (
                            <div
                              key={tpl.id || tpl.name}
                              className="flex flex-col justify-between rounded-xl border border-[#CBD6D7] bg-white p-4 text-xs transition-shadow hover:shadow-xs"
                            >
                              <div>
                                <div className="flex items-start justify-between gap-2 border-b border-[#F0F4F4] pb-2.5">
                                  <div>
                                    <h4 className="font-bold text-[#353B47] break-all">
                                      {tpl.name}
                                    </h4>
                                    <div className="mt-1 flex items-center gap-1.5 text-[10px] text-[#808C99]">
                                      <span className="font-semibold uppercase tracking-wider">
                                        {tpl.category || 'UTILITY'}
                                      </span>
                                      <span>•</span>
                                      <span>{tpl.language || 'pt_BR'}</span>
                                    </div>
                                  </div>

                                  <span
                                    className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                      isApproved
                                        ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                                        : isRejected
                                          ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                                          : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                                    }`}
                                  >
                                    {isApproved
                                      ? 'Aprovado ✓'
                                      : isRejected
                                        ? 'Rejeitado'
                                        : 'Pendente...'}
                                  </span>
                                </div>

                                {isRejected && tpl.rejected_reason && (
                                  <div className="mt-2 rounded-md border border-rose-200 bg-rose-50/80 p-2 text-[10px] text-rose-700">
                                    <strong className="font-semibold">Motivo da Meta:</strong>{' '}
                                    <code className="font-mono">{tpl.rejected_reason}</code>
                                  </div>
                                )}

                                {/* Conteúdo do corpo */}
                                <div className="mt-3 rounded-lg bg-[#F8FAFA] p-2.5 font-sans text-[11px] leading-relaxed text-[#4A5568] whitespace-pre-wrap break-words border border-[#E9EFEF]">
                                  {bodyPreview}
                                </div>

                                {buttonsComp?.buttons && buttonsComp.buttons.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    {buttonsComp.buttons.map((b, i) => (
                                      <span
                                        key={i}
                                        className="inline-flex items-center rounded-md border border-[#CBD6D7] bg-white px-2 py-0.5 text-[10px] font-medium text-[#464B5F]"
                                      >
                                        🔘 {b.text}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <div className="mt-4 pt-3 border-t border-[#F0F4F4] flex items-center justify-between">
                                <span className="text-[10px] text-[#9AA5B1]">
                                  {tpl.created_at
                                    ? `Criado em ${new Date(tpl.created_at).toLocaleDateString('pt-BR')}`
                                    : 'Meta Cloud API'}
                                </span>

                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  disabled={deletingTemplateName === (tpl.id || tpl.name)}
                                  onClick={() => void handleDeleteTemplate(tpl.id || tpl.name)}
                                  className="h-7 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700 px-2"
                                  title="Excluir template"
                                >
                                  {deletingTemplateName === (tpl.id || tpl.name) ? (
                                    <AppIcons.spinner className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <>
                                      <AppIcons.trash className="mr-1 h-3.5 w-3.5" />
                                      Excluir
                                    </>
                                  )}
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* MODAL / DIALOG DE CRIAÇÃO DE TEMPLATE */}
                {newTemplateModalOpen && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
                    <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-[#CBD6D7]">
                      <div className="flex items-center justify-between border-b border-[#E8EFF0] pb-3">
                        <div className="flex items-center gap-2">
                          <div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-100 text-emerald-700">
                            <AppIcons.template className="h-4 w-4" />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-[#353B47]">
                              Novo Template de Mensagem
                            </h3>
                            <p className="text-[11px] text-[#7E8896]">
                              Submeter modelo para aprovação da Meta
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setNewTemplateModalOpen(false)}
                          className="rounded-lg p-1 text-[#8A929C] hover:bg-slate-100"
                        >
                          ✕
                        </button>
                      </div>

                      <form
                        onSubmit={(e) => void handleCreateTemplate(e)}
                        className="mt-4 space-y-4"
                      >
                        <div>
                          <Label className="text-xs font-semibold text-[#464B5F]">
                            Nome do template (Meta) <span className="text-rose-500">*</span>
                          </Label>
                          <Input
                            value={tplName}
                            onChange={(e) =>
                              setTplName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))
                            }
                            placeholder="ex: retomada_contato_atrasado"
                            className="mt-1 border-[#CBD6D7] text-xs font-mono"
                            required
                          />
                          <p className="mt-1 text-[10px] text-[#9AA5B1]">
                            Apenas letras minúsculas, números e sublinhado (_). Sem espaços.
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs font-semibold text-[#464B5F]">
                              Categoria
                            </Label>
                            <select
                              value={tplCategory}
                              onChange={(e) => setTplCategory(e.target.value as TemplateCategory)}
                              className="mt-1 w-full rounded-md border border-[#CBD6D7] bg-white px-3 py-2 text-xs text-[#464B5F]"
                            >
                              <option value="UTILITY">UTILIDADE (Utility)</option>
                              <option value="MARKETING">MARKETING (Marketing)</option>
                              <option value="AUTHENTICATION">AUTENTICAÇÃO (OTP)</option>
                            </select>
                          </div>

                          <div>
                            <Label className="text-xs font-semibold text-[#464B5F]">Idioma</Label>
                            <Input
                              value={tplLanguage}
                              onChange={(e) => setTplLanguage(e.target.value)}
                              placeholder="pt_BR"
                              className="mt-1 border-[#CBD6D7] text-xs"
                            />
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-semibold text-[#464B5F]">
                              Corpo da mensagem (Body) <span className="text-rose-500">*</span>
                            </Label>
                            <span className="text-[10px] text-emerald-700 font-medium">
                              Use {'{{1}}'}, {'{{2}}'} para variáveis
                            </span>
                          </div>
                          <textarea
                            value={tplBody}
                            onChange={(e) => setTplBody(e.target.value)}
                            rows={4}
                            placeholder="Olá {{1}}, lembramos que seu pedido {{2}} está pronto para coleta."
                            className="mt-1 w-full rounded-md border border-[#CBD6D7] bg-white p-3 text-xs leading-relaxed text-[#464B5F] focus:border-[#10B981] focus:ring-1 focus:ring-emerald-200 outline-none"
                            required
                          />
                        </div>

                        {/* Amostras / Exemplos das variáveis para aprovação da Meta */}
                        {detectedVariables.length > 0 && (
                          <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs font-semibold text-emerald-900 flex items-center gap-1.5">
                                <AppIcons.checkCircle className="h-3.5 w-3.5 text-emerald-600" />
                                Exemplos das variáveis (Exigência da Meta)
                              </Label>
                              <span className="text-[10px] text-emerald-700">
                                Preenchimento automático ativo
                              </span>
                            </div>
                            <p className="text-[10px] text-emerald-800 leading-tight">
                              A Meta exige valores de amostra para toda variável. Se deixar em
                              branco, geramos exemplos plausíveis automaticamente para evitar
                              REJECTED.
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                              {detectedVariables.map((varNum, idx) => {
                                const placeholderHint =
                                  idx === 0
                                    ? 'ex: João'
                                    : idx === 1
                                      ? 'ex: pedido #1234'
                                      : `ex: informação ${varNum}`
                                return (
                                  <div key={varNum} className="flex items-center gap-1.5">
                                    <span className="shrink-0 rounded bg-emerald-100 border border-emerald-300 px-1.5 py-1 text-[11px] font-mono text-emerald-800">
                                      {`{{${varNum}}}`}
                                    </span>
                                    <Input
                                      value={tplExamples[varNum] || ''}
                                      onChange={(e) =>
                                        setTplExamples((prev) => ({
                                          ...prev,
                                          [varNum]: e.target.value,
                                        }))
                                      }
                                      placeholder={placeholderHint}
                                      className="border-emerald-200 text-xs bg-white h-8"
                                    />
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        <div className="rounded-lg border border-[#E8EFF0] bg-[#F8FAFA] p-3 space-y-2">
                          <Label className="text-xs font-semibold text-[#464B5F]">
                            Botão Opcional
                          </Label>
                          <div className="grid grid-cols-2 gap-2">
                            <Input
                              value={tplButtonText}
                              onChange={(e) => setTplButtonText(e.target.value)}
                              placeholder="Texto do botão (ex: Ver Pedido)"
                              className="border-[#CBD6D7] text-xs bg-white"
                            />
                            <Input
                              value={tplButtonUrl}
                              onChange={(e) => setTplButtonUrl(e.target.value)}
                              placeholder="URL opcional (ex: https://.../{{1}})"
                              className="border-[#CBD6D7] text-xs bg-white"
                            />
                          </div>

                          {(tplButtonUrl.includes('{{1}}') || tplButtonUrl.includes('{{ 1 }}')) && (
                            <div className="pt-1">
                              <Label className="text-[10px] font-medium text-[#464B5F]">
                                Exemplo da variável da URL (ex: summer2026 ou 1234)
                              </Label>
                              <Input
                                value={tplButtonUrlExample}
                                onChange={(e) => setTplButtonUrlExample(e.target.value)}
                                placeholder="ex: 12345"
                                className="mt-0.5 border-[#CBD6D7] text-xs bg-white h-7"
                              />
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E8EFF0]">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setNewTemplateModalOpen(false)}
                            disabled={creatingTemplate}
                            className="text-xs text-[#637080]"
                          >
                            Cancelar
                          </Button>
                          <Button
                            type="submit"
                            size="sm"
                            disabled={creatingTemplate || !tplName.trim() || !tplBody.trim()}
                            className="bg-[#10B981] hover:bg-[#059669] text-white text-xs font-semibold"
                          >
                            {creatingTemplate ? (
                              <>
                                <AppIcons.spinner className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                Submetendo à Meta...
                              </>
                            ) : (
                              'Submeter Template'
                            )}
                          </Button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ----------------------------------------------------------------- */}
            {/* SEÇÃO 4: WEBHOOK & EVENTOS EM TEMPO REAL                          */}
            {/* ----------------------------------------------------------------- */}
            {activeSection === 'webhook-events' && (
              <div className="space-y-6">
                <div className="rounded-xl border border-[#CBD6D7] bg-white p-6 sm:p-7 shadow-xs">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-[#CBD6D7] pb-5">
                    <div>
                      <h2 className="text-base font-bold text-[#464B5F] sm:text-lg">
                        Webhook de mensagens em tempo real
                      </h2>
                      <p className="mt-1 text-xs text-[#7A838D]">
                        Receba novas mensagens instantaneamente na fila sem precisar sincronizar.
                      </p>
                    </div>
                    <span className="inline-flex w-fit items-center rounded-md border border-[#CBD6D7] bg-[#FBFBFB] px-2.5 py-1 text-[11px] font-medium text-[#464B5F]">
                      Eventos message.received e message.sent
                    </span>{' '}
                  </div>

                  <p className="mt-4 text-xs leading-relaxed text-[#7A838D]">
                    O webhook permite que novas mensagens enviadas pelos clientes cheguem
                    instantaneamente à sua fila, sem necessidade de sincronização manual. Você pode
                    cadastrá-lo com 1 clique abaixo via API da Zernio:
                  </p>

                  {/* Botão de cadastro automático */}
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Button
                      type="button"
                      onClick={() => void handleAutoRegisterWebhook()}
                      disabled={registeringWebhook || !apiKeyConfigured}
                      className="bg-[#464B5F] text-white hover:bg-[#383C4C] text-xs font-medium shadow-none"
                    >
                      {registeringWebhook ? (
                        <>
                          <AppIcons.spinner className="mr-2 h-3.5 w-3.5 animate-spin" />
                          Cadastrando webhook na Zernio...
                        </>
                      ) : (
                        <>
                          <AppIcons.aiSparkle className="mr-1.5 h-3.5 w-3.5 text-[#E5A14C]" />
                          Cadastrar webhook automaticamente
                        </>
                      )}
                    </Button>

                    {!apiKeyConfigured && (
                      <span className="text-xs text-[#C55348]">
                        * Configure ZERNIO_API_KEY para habilitar o cadastro automático.
                      </span>
                    )}
                  </div>

                  {/* Feedback inline */}
                  {webhookFeedback && (
                    <div
                      className={`mt-4 flex items-start gap-2.5 rounded-lg border p-3 text-xs leading-relaxed ${
                        webhookFeedback.type === 'success'
                          ? 'border-[#BDE3D5] bg-[#F1FAF7] text-[#2F6B56]'
                          : webhookFeedback.type === 'warning'
                            ? 'border-[#F8EEDD] bg-[#FDF8F0] text-[#A4671E]'
                            : 'border-[#F2D6D3] bg-[#FEF6F5] text-[#C55348]'
                      }`}
                    >
                      {webhookFeedback.type === 'success' ? (
                        <AppIcons.checkCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#3FB980]" />
                      ) : (
                        <AppIcons.warningCircle
                          className={`mt-0.5 h-4 w-4 shrink-0 ${
                            webhookFeedback.type === 'warning' ? 'text-[#E5A14C]' : 'text-[#C55348]'
                          }`}
                        />
                      )}
                      <div className="flex-1">
                        <p className="font-semibold">{webhookFeedback.message}</p>
                        {webhookFeedback.type === 'warning' && (
                          <p className="mt-1 text-[11px] opacity-90">
                            Dica: Acesse{' '}
                            <a
                              href={ZERNIO_REFERRAL_URL}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-bold underline hover:text-[#2C8A55]"
                            >
                              zernio.com
                            </a>{' '}
                            e contate o suporte solicitando ativação de &quot;inbox access /
                            webhooks&quot;, ou utilize a URL de produção abaixo para cadastro manual
                            no painel.
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Status da detecção de Webhook cadastrado na Zernio */}
                  {registeredWebhooks.length > 0 ? (
                    <div className="mt-4 rounded-lg border border-[#BDE3D5] bg-[#F1FAF7] p-3 text-xs text-[#2F6B56]">
                      <div className="flex items-center gap-2 font-semibold">
                        <AppIcons.checkCircle className="h-4 w-4 text-[#3FB980]" />
                        Webhook cadastrado na Zernio ({registeredWebhooks.length} ativo):
                      </div>
                      <div className="mt-2 space-y-1 pl-6 text-[11px]">
                        {registeredWebhooks.map((wh, idx) => (
                          <div key={wh._id || idx} className="truncate">
                            <strong>{wh.name || 'Webhook'}:</strong>{' '}
                            <code className="font-mono text-[10px]">{wh.url}</code>
                            {wh.isActive ? ' (Ativo ✓)' : ' (Inativo)'}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-lg border border-[#CBD6D7] bg-[#FBFBFB] p-3 text-xs text-[#7A838D]">
                      <div className="flex items-start gap-2">
                        <AppIcons.warningCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#E5A14C]" />
                        <div>
                          <strong className="text-[#464B5F]">
                            Nenhum webhook detectado na sua conta Zernio ainda:
                          </strong>
                          <p className="mt-1 leading-relaxed">
                            Clique no botão <strong>"Cadastrar webhook automaticamente"</strong>{' '}
                            acima para configurar sem complicações, ou utilize a alternativa manual
                            abaixo se preferir.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Alternativa Manual: URL Copiável */}
                  <div className="mt-5 pt-4 border-t border-[#CBD6D7]">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-[#464B5F]">
                        Alternativa manual (cadastro no painel da Zernio)
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#2F6B56]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#3FB980]" />
                        Endpoint Ativo
                      </span>
                    </div>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <code className="min-w-0 flex-1 select-all break-all rounded-lg border border-[#CBD6D7] bg-white px-3.5 py-2 font-mono text-xs text-[#464B5F]">
                        {webhookUrl}
                      </code>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void copyToClipboard(webhookUrl, 'URL do Webhook da API')}
                        className="shrink-0 border-[#CBD6D7] bg-white text-xs font-medium text-[#464B5F] hover:bg-[#F4F7F7]"
                      >
                        <AppIcons.copy className="mr-1.5 h-3.5 w-3.5 text-[#7A838D]" />
                        Copiar URL
                      </Button>
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-[#7A838D]">
                      No painel em{' '}
                      <a
                        href={ZERNIO_REFERRAL_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline text-[#464B5F] font-medium hover:text-[#2C8A55]"
                      >
                        zernio.com
                      </a>{' '}
                      → Settings → Webhooks, adicione a URL acima selecionando os eventos{' '}
                      <code className="rounded border border-[#CBD6D7] bg-white px-1 py-0.5 font-mono text-[10px] text-[#464B5F]">
                        message.received
                      </code>{' '}
                      e{' '}
                      <code className="rounded border border-[#CBD6D7] bg-white px-1 py-0.5 font-mono text-[10px] text-[#464B5F]">
                        message.sent
                      </code>
                      .
                    </p>
                  </div>

                  <p className="mt-4 text-xs leading-relaxed text-[#7A838D]">
                    Se definir um segredo de assinatura no painel da Zernio, configure-o no secret{' '}
                    <code className="rounded border border-[#CBD6D7] bg-white px-1 py-0.5 font-mono text-[11px] text-[#464B5F]">
                      ZERNIO_WEBHOOK_SECRET
                    </code>{' '}
                    do Skip Cloud para validação HMAC automática.
                    {webhookSecretConfigured && (
                      <span className="ml-2 inline-flex items-center gap-1 font-semibold text-[#2F6B56]">
                        <AppIcons.check className="h-3 w-3 text-[#3FB980]" /> HMAC ativo no servidor
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* ----------------------------------------------------------------- */}
            {/* SEÇÃO 5: PREFERÊNCIAS DO ASSISTENTE & MODO DE OPERAÇÃO            */}
            {/* ----------------------------------------------------------------- */}
            {activeSection === 'assistant-preferences' && (
              <div className="space-y-6">
                {/* Modo de operação */}
                <div className="rounded-xl border border-[#CBD6D7] bg-white p-6 sm:p-7 shadow-xs">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-[#CBD6D7] pb-5">
                    <div>
                      <h2 className="text-base font-bold text-[#464B5F] sm:text-lg">
                        Modo de operação do assistente
                      </h2>
                      <p className="mt-0.5 text-xs text-[#7A838D]">
                        Defina se o app opera em modo revisão (sugere para validação) ou com envio
                        assistido direto via API oficial da Meta.
                      </p>
                    </div>
                    <span
                      className={`inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                        operationMode === 'read_write'
                          ? 'border-[#BDE3D5] bg-[#F1FAF7] text-[#2F6B56]'
                          : 'border-[#CBD6D7] bg-white text-[#7A838D]'
                      }`}
                    >
                      {operationMode === 'read_write' ? 'Envio assistido' : 'Modo revisão'}
                    </span>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      disabled={savingMode}
                      onClick={() => void handleModeChange('read_only')}
                      className={`flex flex-col items-start rounded-lg border p-4 text-left transition-all ${
                        operationMode === 'read_only'
                          ? 'border-[#464B5F] bg-white shadow-none ring-1 ring-[#464B5F]'
                          : 'border-[#CBD6D7] bg-white hover:bg-[#FBFBFB]'
                      }`}
                    >
                      <div className="flex items-center gap-2 text-xs font-semibold text-[#464B5F]">
                        <AppIcons.modeReadOnly className="h-4 w-4 text-[#7A838D]" />
                        Modo revisão (Supervisão)
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-[#7A838D]">
                        O atendente lê o histórico e formula rascunhos para você revisar e validar
                        com calma antes de enviar.
                      </p>
                    </button>

                    <button
                      type="button"
                      disabled={savingMode}
                      onClick={() => void handleModeChange('read_write')}
                      className={`flex flex-col items-start rounded-lg border p-4 text-left transition-all ${
                        operationMode === 'read_write'
                          ? 'border-[#464B5F] bg-white shadow-none ring-1 ring-[#464B5F]'
                          : 'border-[#CBD6D7] bg-white hover:bg-[#FBFBFB]'
                      }`}
                    >
                      <div className="flex items-center gap-2 text-xs font-semibold text-[#464B5F]">
                        <AppIcons.modeReadWrite className="h-4 w-4 text-[#3FB980]" />
                        Envio assistido (Zernio API)
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-[#7A838D]">
                        Permite enviar a resposta sugerida diretamente pela API oficial com 1
                        clique, respeitando a janela de 24h da Meta.
                      </p>
                    </button>
                  </div>

                  {operationMode === 'read_write' && (
                    <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-[#BDE3D5] bg-[#F1FAF7] p-3 text-xs text-[#2F6B56]">
                      <AppIcons.shieldSafe className="mt-0.5 h-4 w-4 shrink-0 text-[#3FB980]" />
                      <span>
                        <strong className="font-semibold">Regra das 24 horas da Meta:</strong>{' '}
                        Mensagens livres só podem ser enviadas em até 24h após a última mensagem
                        recebida do lead. Envios só acontecem mediante clique explícito do usuário.
                      </span>
                    </div>
                  )}
                </div>

                {/* Alertas */}
                <div className="rounded-xl border border-[#CBD6D7] bg-white p-6 sm:p-7 shadow-xs">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#F4F7F7] text-[#464B5F]">
                      <AppIcons.bell className="h-4 w-4 text-[#464B5F]" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#464B5F]">Alertas</h3>
                      <p className="text-xs text-[#A3A5AF]">
                        Defina o que merece chamar sua atenção nas filas.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Preference
                      title="Follow-ups vencidos"
                      detail="Destacar retomadas que passaram do prazo."
                      checked
                    />
                    <Preference
                      title="Leads sem resposta"
                      detail="Mostrar conversas prioritárias acima de 24 horas."
                      checked
                    />
                  </div>
                </div>

                {/* Sincronização geral de conversas */}
                <div className="rounded-xl border border-[#CBD6D7] bg-white p-6 sm:p-7 shadow-xs">
                  <h3 className="text-sm font-bold text-[#464B5F]">Sincronização manual geral</h3>
                  <p className="mt-1 text-xs text-[#7A838D]">
                    Dispara o polling imediato em todos os números conectados da conta.
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleSyncAccount()}
                      disabled={syncing || Boolean(syncingAccountId) || !apiKeyConfigured}
                      className="border-[#CBD6D7] bg-white text-xs font-medium text-[#464B5F] hover:bg-[#F4F7F7]"
                    >
                      {syncing ? (
                        <>
                          <AppIcons.spinner className="mr-2 h-3.5 w-3.5 animate-spin" />
                          Sincronizando todas as conversas...
                        </>
                      ) : (
                        <>
                          <AppIcons.sync className="mr-1.5 h-3.5 w-3.5 text-[#7A838D]" />
                          Sincronizar todas as conversas agora
                        </>
                      )}
                    </Button>
                  </div>

                  {lastSyncedAt && (
                    <p className="mt-2.5 text-[11px] text-[#A3A5AF]">
                      Última sincronização com sucesso:{' '}
                      {new Date(lastSyncedAt).toLocaleString('pt-BR')}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ----------------------------------------------------------------- */}
            {/* SEÇÃO 6: CONTA, ORGANIZAÇÃO & SEGURANÇA                          */}
            {/* ----------------------------------------------------------------- */}
            {activeSection === 'account-org' && (
              <div className="space-y-6">
                {/* Perfil */}
                <div className="rounded-xl border border-[#CBD6D7] bg-white p-6 sm:p-7 shadow-xs">
                  <div className="mb-5 flex items-center gap-3">
                    <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#F4F7F7] text-[#464B5F]">
                      <AppIcons.singleProfile className="h-4 w-4 text-[#464B5F]" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-[#464B5F]">Seu perfil</h2>
                      <p className="text-xs text-[#A3A5AF]">
                        Dados usados para identificar sua sessão.
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs font-medium text-[#464B5F]">Nome</Label>
                      <Input
                        value={user ? sanitizeDisplayName(user.name, user.email, '') : ''}
                        readOnly
                        className="mt-1.5 border-[#CBD6D7] bg-[#FBFBFB] text-xs text-[#464B5F]"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-[#464B5F]">E-mail</Label>
                      <Input
                        value={String(user?.email || '')}
                        readOnly
                        className="mt-1.5 border-[#CBD6D7] bg-[#FBFBFB] text-xs text-[#464B5F]"
                      />
                    </div>
                  </div>
                </div>

                {/* Segurança e transparência */}
                <div className="rounded-xl border border-[#CBD6D7] bg-white p-6 sm:p-7 shadow-xs">
                  <div className="flex items-start gap-3.5">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#F4F7F7] text-[#464B5F]">
                      <AppIcons.shieldSafe className="h-4 w-4 text-[#464B5F]" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#464B5F]">
                        Garantias de segurança e controle
                      </h3>
                      <p className="mt-1.5 text-xs leading-relaxed text-[#7A838D]">
                        O atendente coloca você no controle de cada interação. Suas credenciais
                        permanecem isoladas nas variáveis de ambiente do backend e as requisições
                        utilizam a infraestrutura oficial da Meta Cloud API via Zernio.
                      </p>
                      <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-[#CBD6D7] bg-[#FBFBFB] p-3 text-xs leading-relaxed text-[#464B5F]">
                        <AppIcons.checkCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#3FB980]" />
                        <span>
                          Com a API oficial da Zernio conectada, você opera com total conformidade e
                          estabilidade oficial da Meta Cloud API.
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Botão de Logout */}
                <div className="pt-2">
                  <Button
                    variant="outline"
                    onClick={logout}
                    className="border-[#CBD6D7] bg-white text-xs font-medium text-[#464B5F] hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                  >
                    <AppIcons.logout className="mr-2 h-4 w-4 text-red-500" />
                    Sair da conta
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

function SecretRow({
  name,
  badgeType,
  microtext,
  configured,
  onCopy,
}: {
  name: string
  badgeType: 'required' | 'optional' | 'recommended'
  microtext: string
  configured: boolean
  onCopy: () => void
}) {
  return (
    <div className="grid grid-cols-12 items-start sm:items-center gap-2 border-b border-[#CBD6D7] px-4 py-3.5 text-xs last:border-0 hover:bg-[#FBFBFB] transition-colors">
      <div className="col-span-12 sm:col-span-4 flex flex-wrap items-center gap-2 font-mono">
        <button
          type="button"
          onClick={onCopy}
          className="group inline-flex items-center gap-1.5 font-semibold text-[#464B5F] hover:text-[#2563EB] transition-colors"
          title="Clique para copiar o nome exato do secret"
        >
          <span className="truncate">{name}</span>
          <AppIcons.copy className="h-3 w-3 text-[#A3A5AF] group-hover:text-[#2563EB]" />
        </button>

        {badgeType === 'required' && (
          <span className="inline-flex items-center rounded border border-[#F2D6D3] bg-[#FEF6F5] px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-[#C55348]">
            OBRIGATÓRIO
          </span>
        )}
        {badgeType === 'recommended' && (
          <span className="inline-flex items-center rounded border border-[#F0DFC6] bg-[#FDF8F0] px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-[#A4671E]">
            RECOMENDADO
          </span>
        )}
        {badgeType === 'optional' && (
          <span className="inline-flex items-center rounded border border-[#CBD6D7] bg-[#F4F7F7] px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-[#7A838D]">
            OPCIONAL / LEGADO
          </span>
        )}
      </div>

      <div className="col-span-8 sm:col-span-5 text-xs text-[#7A838D] leading-relaxed">
        <p>{microtext}</p>
      </div>

      <div className="col-span-4 sm:col-span-3 flex justify-end items-center">
        {configured ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-[#BDE3D5] bg-[#F1FAF7] px-2 py-0.5 text-[10px] font-medium text-[#2F6B56]">
            <AppIcons.checkCircle className="h-3 w-3 text-[#3FB980]" />
            Configurado
          </span>
        ) : badgeType === 'required' ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-[#F2D6D3] bg-[#FEF6F5] px-2 py-0.5 text-[10px] font-medium text-[#C55348]">
            <AppIcons.closeCircle className="h-3 w-3 text-[#C55348]" />
            Ausente
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md border border-[#CBD6D7] bg-white px-2 py-0.5 text-[10px] font-medium text-[#7A838D]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#A3A5AF]" />
            Não configurado (ok)
          </span>
        )}
      </div>
    </div>
  )
}

function Preference({
  title,
  detail,
  checked,
}: {
  title: string
  detail: string
  checked: boolean
}) {
  return (
    <div className="flex items-center justify-between border-t border-[#CBD6D7] py-4 first:border-0">
      <div>
        <p className="text-xs font-semibold text-[#464B5F]">{title}</p>
        <p className="mt-0.5 text-[11px] text-[#A3A5AF]">{detail}</p>
      </div>
      <Switch defaultChecked={checked} />
    </div>
  )
}
