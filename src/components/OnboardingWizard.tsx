import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { AppIcons } from '@/lib/icons'
import { Button } from '@/components/ui/button'

import { ZernioLogo, ZERNIO_REFERRAL_URL } from '@/components/ZernioLogo'
import { PostOnboardingTransition } from '@/components/PostOnboardingTransition'
import { useOnboarding } from '@/contexts/OnboardingContext'
import { useCrm } from '@/contexts/CrmContext'

import step1Screenshot from '@/assets/captura-de-tela-2026-09-21-162528-cb96e.png'
import step2Screenshot from '@/assets/captura-de-tela-2026-09-21-162549-64b92.png'
import step3Screenshot from '@/assets/captura-de-tela-2026-09-21-162608-2f0ea.png'
import {
  testZernioConnection,
  setupZernioWebhook,
  saveZernioSettings,
  formatPhoneNumber,
  sanitizeWebhookErrorMessage,
  type ZernioAccountItem,
} from '@/services/zernio'

export default function OnboardingWizard() {
  const { isOpen, currentStep, goToStep, skipOnboarding, completeOnboarding } = useOnboarding()
  const { refresh, refreshZernioSettings } = useCrm()
  const navigate = useNavigate()

  // Passo 2 State
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean
    message: string
    accounts?: ZernioAccountItem[]
  } | null>(null)

  // Passo 4 (Webhook) State
  const [isRegisteringWebhook, setIsRegisteringWebhook] = useState(false)
  const [webhookResult, setWebhookResult] = useState<{
    success: boolean
    message: string
    alreadyRegistered?: boolean
  } | null>(null)

  // Aviso de confirmação para pular
  const [showSkipWarning, setShowSkipWarning] = useState(false)

  // Estado da transição cinematográfica pós-passo 4
  const [showTransition, setShowTransition] = useState(false)

  // Passo 3 Carrossel / Stepper de imagens reais & Lightbox
  const [activeStep3Slide, setActiveStep3Slide] = useState(0)
  const [lightboxImage, setLightboxImage] = useState<{
    src: string
    title: string
    desc: string
  } | null>(null)

  // Suporte a tecla Escape para fechar o lightbox
  useEffect(() => {
    if (!lightboxImage) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightboxImage(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [lightboxImage])

  // ==========================================
  // Handlers
  // ==========================================

  const handleTestKey = async () => {
    setIsTesting(true)
    setTestResult(null)
    const key = apiKeyInput.trim()
    try {
      // Se digitou uma chave, testa passando a chave explicitamente
      const res = await testZernioConnection(key || undefined)
      if (res.connected) {
        // Garantir também persistência via saveZernioSettings caso o backend hook precise de redundância
        if (key) {
          try {
            await saveZernioSettings({
              zernio_api_key: key,
              is_connected: true,
              test_status_message: res.message || 'Conectado à Zernio com sucesso',
              zernio_account_id: res.accounts?.[0]?.id,
              zernio_phone_number_id: res.accounts?.[0]?.phoneNumber,
            })
          } catch {
            /* intentionally ignored */
          }
        }
        setTestResult({
          success: true,
          message: res.message || 'Conexão validada com sucesso na Zernio!',
          accounts: res.accounts,
        })
        toast.success('Conexão com a Zernio validada com sucesso!')
        await refreshZernioSettings()
        await refresh()
      } else {
        setTestResult({
          success: false,
          message: res.message || 'Não foi possível validar a chave da Zernio.',
        })
        toast.error(`Falha na validação: ${res.message}`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao testar a chave da Zernio.'
      setTestResult({
        success: false,
        message: msg,
      })
      toast.error(msg)
    } finally {
      setIsTesting(false)
    }
  }

  const handleSetupWebhook = async () => {
    setIsRegisteringWebhook(true)
    setWebhookResult(null)
    try {
      const res = await setupZernioWebhook(apiKeyInput.trim() || undefined)
      if (res.success) {
        const msg = res.alreadyRegistered
          ? 'Webhook já estava cadastrado e ativo na Zernio ✓'
          : 'Webhook cadastrado na Zernio com sucesso ✓'
        setWebhookResult({
          success: true,
          message: msg,
          alreadyRegistered: res.alreadyRegistered,
        })
        toast.success(msg)
        await refreshZernioSettings()
      } else {
        const friendlyMsg = sanitizeWebhookErrorMessage(res.message, res.statusCode)
        setWebhookResult({
          success: false,
          message: friendlyMsg,
        })
        toast.error(friendlyMsg)
      }
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : 'Erro ao cadastrar webhook na Zernio.'
      const friendlyMsg = sanitizeWebhookErrorMessage(rawMsg)
      setWebhookResult({
        success: false,
        message: friendlyMsg,
      })
      toast.error(friendlyMsg)
    } finally {
      setIsRegisteringWebhook(false)
    }
  }

  const handleProceedToTransition = () => {
    // Passo 3 concluído -> Abre a transição cinematográfica que executa e acompanha a sincronização real
    setShowTransition(true)
  }

  const handleCompleteTransition = async () => {
    // Persiste imediatamente a conclusão do onboarding ANTES de navegar
    await completeOnboarding()
    setShowTransition(false)
    navigate('/inbox')
  }

  const handleConfirmSkip = () => {
    setShowSkipWarning(false)
    skipOnboarding()
  }

  // Se a transição cinematográfica estiver ativa, renderiza em tela cheia
  if (showTransition) {
    return <PostOnboardingTransition autoStartSync={true} onComplete={handleCompleteTransition} />
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto overscroll-contain bg-slate-950/90 text-[#353B47]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      {/* Imagem de fundo azul-gelo cobrindo toda a área do wizard com a mesma técnica de PostOnboardingTransition */}
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center bg-no-repeat opacity-85"
        style={{
          backgroundImage:
            "url('https://res.cloudinary.com/dfrzlhyvi/image/upload/v1789769629/bg-exemplo-2-azul-gelo_bfo81i.png')",
        }}
        aria-hidden="true"
      />

      {/* Gradiente radial sutil para foco central cinematográfico, SEM overlay branco chapado */}
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-radial from-slate-900/10 via-slate-900/50 to-slate-950/80"
        aria-hidden="true"
      />

      {/* Card principal do wizard: superfície translúcida com blur com altura máxima restrita à viewport (max-h-[90vh] / [92vh]) */}
      <div
        className={`relative z-10 w-full ${
          currentStep === 3 ? 'max-w-6xl w-[min(96vw,72rem)]' : 'max-w-2xl'
        } max-h-[92vh] flex flex-col overflow-hidden rounded-3xl border border-[#CBD6D7]/70 bg-white/95 backdrop-blur-xl shadow-2xl transition-all duration-300 animate-grow-up`}
      >
        {/* Barra superior de brilho suave idêntica à transição (fixa no topo do card) */}
        <div className="shrink-0 h-1.5 w-full bg-linear-to-r from-[#3B82F6] via-[#10B981] to-[#8B5CF6]" />

        {/* Header do Wizard com Progresso e Indicadores (fixo no topo, nunca rola) */}
        <div className="shrink-0 border-b border-[#CBD6D7]/60 bg-white/80 px-6 pt-4 pb-3.5 sm:px-8">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <span
                id="onboarding-title"
                className="font-bold tracking-tight text-sm text-[#2B303B]"
              >
                Assistente de Configuração Alô
              </span>
            </div>

            {/* Ação Pular por agora */}
            <button
              type="button"
              onClick={() => setShowSkipWarning(true)}
              className="rounded-md px-2 py-1 text-xs font-semibold text-[#5F6876] hover:text-[#2B303B] hover:bg-slate-100/70 transition-colors cursor-pointer"
            >
              Pular por agora
            </button>
          </div>

          {/* Stepper visual (4 passos completos) */}
          <div className="grid grid-cols-4 gap-2 pt-0.5">
            {[
              { num: 1, label: 'Boas-vindas' },
              { num: 2, label: 'Conectar Zernio' },
              { num: 3, label: 'Conectar WhatsApp' },
              { num: 4, label: 'Ativar ao vivo' },
            ].map((step) => {
              const isCurrent = currentStep === step.num
              const isDone = currentStep > step.num
              return (
                <div key={step.num} className="flex flex-col gap-1">
                  <div
                    className={`h-1.5 w-full rounded-full transition-colors ${
                      isDone ? 'bg-[#10B981]' : isCurrent ? 'bg-[#3B82F6]' : 'bg-[#CBD6D7]/60'
                    }`}
                  />
                  <span
                    className={`text-[10px] truncate ${
                      isCurrent
                        ? 'text-[#2B303B] font-bold'
                        : isDone
                          ? 'text-[#059669] font-semibold'
                          : 'text-[#64748B] font-medium'
                    }`}
                    title={`${step.num}. ${step.label}`}
                  >
                    {step.num}. {step.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Modal de confirmação ao clicar em pular (shrink-0 caso exibido) */}
        {showSkipWarning && (
          <div className="shrink-0 relative z-10 p-5 bg-[#FEFBF3] border-b border-amber-300/80 text-xs">
            <div className="flex items-start gap-3">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800">
                <AppIcons.warningCircle className="h-4 w-4 text-amber-800" />
              </div>
              <div className="flex-1 space-y-1">
                <h4 className="font-bold text-[#2B303B] text-sm">Tem certeza que deseja pular?</h4>
                <p className="text-[#353B47] leading-relaxed">
                  Sem conectar, sua inbox fica vazia e nada chega ao vivo. Você pode concluir em 2
                  minutos quando quiser pelo banner superior ou nas Configurações.
                </p>
                <div className="pt-2 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowSkipWarning(false)}
                    className="h-8 text-xs border-[#CBD6D7] bg-white font-semibold text-[#2B303B] hover:bg-slate-50"
                  >
                    Continuar configurando
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleConfirmSkip}
                    className="h-8 text-xs bg-[#2B303B] hover:bg-[#1E232A] text-white font-bold"
                  >
                    Pular assim mesmo
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Corpo dos Passos: flex-1 com overflow-y-auto interno — apenas o corpo rola se exceder */}
        <div className="relative z-10 flex-1 min-h-0 overflow-y-auto px-5 py-4 sm:px-7 sm:py-5 space-y-4">
          {/* ========================================================= */}
          {/* PASSO 1: BOAS-VINDAS */}
          {/* ========================================================= */}
          {currentStep === 1 && (
            <div className="space-y-4 animate-grow-up">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-[#CBD6D7]/80 bg-white/90 backdrop-blur-xs px-2.5 py-0.5 text-[11px] font-semibold tracking-wider text-[#353B47]">
                  <AppIcons.aiSparkle className="h-3 w-3 text-[#3B82F6]" /> PASSO 1 DE 4
                </span>
                <h2 className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-[#2B303B]">
                  Bem-vindo ao Alô
                </h2>
                <p className="mt-1 text-sm text-[#353B47] leading-relaxed">
                  Suas conversas de WhatsApp lidas, priorizadas e sugeridas pra você responder — sem
                  pressão e com a infraestrutura oficial da Zernio.
                </p>
              </div>

              {/* Callout de pré-requisito obrigatório: Conta na Zernio */}
              <div className="rounded-2xl border border-[#BDE3D5] bg-[#F2FAF6]/95 backdrop-blur-xs p-3.5 text-xs shadow-2xs">
                <div className="flex items-start gap-3">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#E6F7F0] border border-[#BDE3D5] text-[#2C8A55]">
                    <AppIcons.key className="h-4 w-4" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <strong className="text-sm font-bold text-[#1E4D3A]">
                        Pré-requisito: você vai precisar de uma conta na Zernio
                      </strong>
                      <span className="rounded-full bg-[#EBF7F2] border border-[#BDE3D5] px-2 py-0.5 text-[10px] font-bold text-[#2C8A55] uppercase tracking-wide">
                        Importante
                      </span>
                    </div>
                    <p className="text-[#1E4D3A] leading-relaxed">
                      Para usar o Alô, a integração oficial com a{' '}
                      <strong className="text-[#1E4D3A]">Meta Cloud API (WhatsApp Business)</strong>{' '}
                      é feita através da Zernio. No próximo passo você só precisará colar a sua
                      chave de API para conectar seus números.
                    </p>
                  </div>
                </div>
              </div>

              {/* 3 Bullets explicativos com fundos translúcidos e contraste nítido */}
              <div className="space-y-2.5 rounded-2xl border border-[#CBD6D7]/80 bg-white/90 backdrop-blur-sm p-3.5 text-xs shadow-2xs">
                <div className="flex items-start gap-3">
                  <div className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-red-50 text-[#EF4444] border border-red-200/80">
                    <AppIcons.queueUrgent className="h-4 w-4 text-[#DC2626]" />
                  </div>
                  <div>
                    <strong className="text-[#2B303B] font-bold text-xs">
                      1. Lê e prioriza suas conversas
                    </strong>
                    <p className="text-[#353B47] mt-0.5 leading-relaxed">
                      Separa clientes quentes, quem está esperando resposta há mais de 24h e
                      mensagens que chegaram de madrugada.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-purple-50 text-[#8B5CF6] border border-purple-200/80">
                    <AppIcons.aiSparkle className="h-4 w-4 text-[#7C3AED]" />
                  </div>
                  <div>
                    <strong className="text-[#2B303B] font-bold text-xs">
                      2. Sugere respostas inteligentes
                    </strong>
                    <p className="text-[#353B47] mt-0.5 leading-relaxed">
                      A IA lê todo o histórico do contato e formula rascunhos com a próxima melhor
                      ação em tom natural.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-green-50 text-[#10B981] border border-green-200/80">
                    <AppIcons.modeReadOnly className="h-4 w-4 text-[#059669]" />
                  </div>
                  <div>
                    <strong className="text-[#2B303B] font-bold text-xs">
                      3. Modo revisão e envio com 1 clique
                    </strong>
                    <p className="text-[#353B47] mt-0.5 leading-relaxed">
                      O assistente lê, prioriza e sugere a resposta ideal. Você valida e envia
                      direto via API oficial da Meta.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* PASSO 2: CONECTAR A ZERNIO */}
          {/* ========================================================= */}
          {currentStep === 2 && (
            <div className="space-y-3.5 animate-grow-up">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-[#CBD6D7]/80 bg-white/90 backdrop-blur-xs px-2.5 py-0.5 text-[11px] font-semibold tracking-wider text-[#353B47]">
                  <AppIcons.key className="h-3 w-3 text-[#F97316]" /> PASSO 2 DE 4
                </span>
                <div className="mt-2 flex items-center gap-3">
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#2B303B]">
                      Conectar à Zernio
                    </h2>
                    <p className="text-xs font-medium text-[#4B5563]">
                      Integração oficial Meta WhatsApp Cloud API
                    </p>
                  </div>
                </div>
                <p className="mt-1.5 text-xs sm:text-sm text-[#353B47] leading-relaxed">
                  Sua API Key está logo na primeira tela do painel da Zernio após o login — basta
                  copiar e colar aqui para validar em tempo real.
                </p>
              </div>

              {/* Banner com link da Zernio translúcido */}
              <div className="rounded-2xl border border-[#CBD6D7] bg-white/90 backdrop-blur-sm p-3 text-xs shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AppIcons.shieldSafe className="h-4 w-4 text-[#2C8A55] shrink-0" />
                    <span className="text-[#2B303B] font-medium text-[11.5px]">
                      Ainda não tem conta na Zernio? Crie e pegue sua API Key:
                    </span>
                  </div>
                  <a
                    href={ZERNIO_REFERRAL_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-1.5 font-bold text-[#1E4D3A] hover:text-[#065F46] hover:underline text-xs"
                  >
                    <span>Abrir Zernio</span>
                    <ZernioLogo height={13} raw className="translate-y-[0.5px]" />
                    <span className="text-[10px]">↗</span>
                  </a>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-[#2B303B]">
                  Chave de API (Bearer Token)
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <AppIcons.key className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
                    <input
                      type="password"
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder="Cole sua API Key aqui (ou teste com a chave do servidor)"
                      className="h-9 w-full rounded-xl border border-[#CBD6D7] bg-white pl-9 pr-3 text-xs font-mono text-[#2B303B] placeholder:text-[#94A3B8] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/30 focus:border-[#3B82F6]"
                    />
                  </div>
                  <Button
                    onClick={handleTestKey}
                    disabled={isTesting}
                    className="bg-[#2B303B] hover:bg-[#1E232A] text-white text-xs px-4 h-9 shrink-0 font-bold rounded-xl shadow-xs"
                  >
                    {isTesting ? (
                      <>
                        <AppIcons.spinner className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Testando...
                      </>
                    ) : (
                      <>
                        <AppIcons.sync className="mr-1.5 h-3.5 w-3.5" /> Testar conexão
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-[11px] text-[#475569] leading-relaxed">
                  💡 Você encontra essa chave imediatamente na 1ª página do painel da Zernio assim
                  que fizer login. Se a chave já estiver salva nas variáveis de ambiente, o teste a
                  utilizará automaticamente.
                </p>
              </div>

              {/* Resultado do Teste compacto com scroll interno na lista de contas */}
              {testResult && (
                <div
                  className={`rounded-2xl border p-3.5 text-xs backdrop-blur-xs transition-all ${
                    testResult.success
                      ? 'border-[#BDE3D5] bg-[#F1FAF7] text-[#1E4D3A]'
                      : 'border-[#F2D6D3] bg-[#FEF6F5] text-[#991B1B]'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {testResult.success ? (
                      <AppIcons.checkCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#10B981]" />
                    ) : (
                      <AppIcons.warningCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#DC2626]" />
                    )}
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="font-bold text-[12px]">{testResult.message}</p>
                      {testResult.accounts && testResult.accounts.length > 0 && (
                        <div className="mt-1.5 space-y-1 border-t border-[#BDE3D5] pt-1.5">
                          <p className="font-bold text-[11px] text-[#1E4D3A]">
                            Encontramos {testResult.accounts.length} WhatsApp
                            {testResult.accounts.length > 1 ? 's' : ''}:
                          </p>
                          <ul className="max-h-24 sm:max-h-28 overflow-y-auto space-y-1 pr-1 text-[11px] text-[#2F6B56] divide-y divide-[#BDE3D5]/40">
                            {testResult.accounts.map((acc) => (
                              <li
                                key={acc.id}
                                className="pt-0.5 flex items-center justify-between gap-2"
                              >
                                <span className="font-semibold text-[#1E4D3A] truncate">
                                  • {acc.displayName || acc.profileName || 'WhatsApp'}
                                </span>
                                {acc.phoneNumber && (
                                  <span className="font-mono text-[10.5px] text-[#166534] shrink-0 bg-white/60 px-1.5 py-0.5 rounded border border-[#BDE3D5]/60">
                                    {formatPhoneNumber(acc.phoneNumber)}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* PASSO 3: CONECTAR SEU WHATSAPP NA ZERNIO (COM CAPTURAS REAIS) */}
          {/* ========================================================= */}
          {currentStep === 3 &&
            (() => {
              const zernioSteps = [
                {
                  num: 1,
                  tag: 'Passo 1 de 3',
                  title: 'Connections → + Connect WhatsApp',
                  caption:
                    '1. No painel da Zernio, abra Connections e clique em + Connect no card do WhatsApp',
                  subCaption:
                    'Localize o card do WhatsApp com o ícone oficial verde e clique no botão "+ Connect".',
                  image: step1Screenshot,
                  hint: 'Destaque com a seta verde indicando o card WhatsApp',
                },
                {
                  num: 2,
                  tag: 'Passo 2 de 3',
                  title: 'Use my own number',
                  caption: "2. Escolha 'Use my own number'",
                  subCaption:
                    'Selecione a opção com o ícone "#" para trazer e autenticar o seu número de WhatsApp atual.',
                  image: step2Screenshot,
                  hint: 'Destaque com a seta verde apontando para a 2ª opção',
                },
                {
                  num: 3,
                  tag: 'Passo 3 de 3 (Recomendado)',
                  title: 'WhatsApp Business app (Coexistence)',
                  caption: "3. Escolha 'I chat from the WhatsApp Business app' (Coexistência)",
                  subCaption:
                    'Essa opção mantém o aplicativo oficial no seu celular funcionando normalmente lado a lado com o Alô.',
                  image: step3Screenshot,
                  hint: 'Destaque com a seta verde na 1ª opção recomendada',
                },
              ]

              const currentSlideData = zernioSteps[activeStep3Slide]

              return (
                <div className="space-y-2 animate-grow-up">
                  {/* Cabeçalho ultra-enxuto do Passo 3 */}
                  <div className="space-y-0">
                    <h2 className="text-base sm:text-lg font-bold tracking-tight text-[#2B303B] leading-tight">
                      Conectar seu WhatsApp na Zernio
                    </h2>
                    <p className="text-[11px] text-[#5F6876] leading-tight">
                      Siga os 3 passos no painel da Zernio para vincular seu número:
                    </p>
                  </div>

                  {/* Grade Panorâmica em 2 colunas para md+ */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 lg:gap-4 items-stretch">
                    {/* COLUNA ESQUERDA: Foco 100% no tutorial, preenchendo a altura de forma harmônica sem vazio */}
                    <div className="md:col-span-5 flex flex-col justify-between gap-3 rounded-2xl border border-[#CBD6D7] bg-white/90 backdrop-blur-md p-3 sm:p-3.5 shadow-xs">
                      <div className="space-y-2.5">
                        {/* Aviso em linha direta com texto compacto */}
                        <div className="flex items-start gap-1.5 text-[11px] text-amber-800 leading-snug">
                          <AppIcons.warningCircle className="h-3.5 w-3.5 shrink-0 text-amber-700 mt-0.5" />
                          <p>
                            <span className="font-semibold text-amber-900">Atenção:</span> sem
                            conectar o WhatsApp na Zernio, a sincronização puxa zero conversas.
                          </p>
                        </div>

                        {/* Lista de Etapas clicáveis sincronizada */}
                        <div className="flex flex-col gap-1.5">
                          {zernioSteps.map((s, idx) => {
                            const isActive = activeStep3Slide === idx
                            return (
                              <button
                                key={s.num}
                                type="button"
                                onClick={() => setActiveStep3Slide(idx)}
                                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-left transition-all cursor-pointer ${
                                  isActive
                                    ? 'border-[#25D366] bg-[#ECFDF5] text-[#065F46] font-semibold shadow-2xs'
                                    : 'border-slate-200/80 bg-white/80 text-[#475569] hover:bg-white hover:border-slate-300'
                                }`}
                              >
                                <span
                                  className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                                    isActive
                                      ? 'bg-[#10B981] text-white shadow-2xs'
                                      : 'bg-slate-100 border border-slate-300 text-slate-600'
                                  }`}
                                >
                                  {s.num}
                                </span>
                                <span className="text-[11.5px] truncate flex-1 leading-tight">
                                  {s.title}
                                </span>
                                {s.num === 3 && (
                                  <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-[#059669] bg-[#E8F8EE] px-1.5 py-0.5 rounded">
                                    Recomendado
                                  </span>
                                )}
                              </button>
                            )
                          })}
                        </div>

                        {/* Detalhe da etapa ativa selecionada em texto puro */}
                        <div className="space-y-1 pt-2 border-t border-slate-200/80">
                          <p className="font-semibold text-[#2B303B] text-xs leading-snug">
                            {currentSlideData.caption}
                          </p>
                          <p className="text-[#5F6876] text-[11px] leading-relaxed">
                            {currentSlideData.subCaption}
                          </p>
                        </div>
                      </div>

                      {/* Dica WhatsApp comum -> Business compacta na base da coluna */}
                      <div className="pt-2 border-t border-slate-200/80 text-[10.5px] text-[#64748B] leading-snug flex items-start gap-1.5">
                        <AppIcons.shieldSafe className="h-3.5 w-3.5 shrink-0 text-[#2C8A55] mt-0.5" />
                        <p>
                          <strong className="text-[#334155]">WhatsApp comum?</strong> Migre grátis
                          para o <strong>WhatsApp Business</strong> e escolha a 1ª opção
                          (Coexistência).
                        </p>
                      </div>
                    </div>

                    {/* COLUNA DIREITA: Visualizador limpo + miniaturas sincronizadas */}
                    <div className="md:col-span-7 flex flex-col justify-between rounded-2xl border border-[#CBD6D7] bg-white/95 backdrop-blur-md p-2.5 sm:p-3 shadow-sm space-y-2">
                      {/* Visualizador da Imagem Ativa com Moldura 16:9 limitada em altura e Zoom/Lightbox */}
                      <div className="relative group rounded-xl border border-slate-200 overflow-hidden bg-slate-900 shadow-inner flex flex-col">
                        {/* Barra superior enxuta com título simples e botão de ampliar */}
                        <div className="flex items-center justify-between px-3 py-1 bg-slate-900 border-b border-slate-800 text-slate-300 text-[10.5px]">
                          <span className="font-medium text-[10.5px] text-slate-300 truncate">
                            {currentSlideData.title}
                          </span>

                          {/* Botão de Ampliar / Lightbox */}
                          <button
                            type="button"
                            onClick={() =>
                              setLightboxImage({
                                src: currentSlideData.image,
                                title: currentSlideData.caption,
                                desc: currentSlideData.subCaption,
                              })
                            }
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/10 hover:bg-white/20 text-white font-medium text-[10px] transition-colors cursor-pointer shrink-0"
                            title="Clique para ampliar a captura em tela cheia"
                          >
                            <AppIcons.modeReadOnly className="h-3 w-3" />
                            <span>Ampliar imagem</span>
                          </button>
                        </div>

                        {/* Imagem Real renderizada em aspecto panorâmico 16:9 restrita em altura (máx 32vh em notebook) */}
                        <div
                          className="relative w-full aspect-video max-h-[32vh] flex items-center justify-center overflow-hidden bg-black/40 cursor-zoom-in"
                          onClick={() =>
                            setLightboxImage({
                              src: currentSlideData.image,
                              title: currentSlideData.caption,
                              desc: currentSlideData.subCaption,
                            })
                          }
                          title="Clique para abrir em tela cheia"
                        >
                          <img
                            src={currentSlideData.image}
                            alt={currentSlideData.caption}
                            className="w-full h-full object-contain transition-transform duration-200 group-hover:scale-[1.01]"
                            loading="eager"
                          />
                        </div>
                      </div>

                      {/* Miniaturas sincronizadas limpas */}
                      <div className="pt-1 border-t border-slate-200">
                        <div className="grid grid-cols-3 gap-2">
                          {zernioSteps.map((s, idx) => {
                            const isActive = activeStep3Slide === idx
                            return (
                              <button
                                key={s.num}
                                type="button"
                                onClick={() => setActiveStep3Slide(idx)}
                                className={`relative rounded-lg border p-1 text-left transition-all cursor-pointer overflow-hidden group ${
                                  isActive
                                    ? 'border-[#10B981] ring-2 ring-[#10B981]/30 bg-[#F1FAF7]'
                                    : 'border-slate-200 bg-white hover:border-slate-300'
                                }`}
                              >
                                <div className="relative aspect-video max-h-14 rounded overflow-hidden bg-slate-100">
                                  <img
                                    src={s.image}
                                    alt={s.caption}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                  />
                                </div>
                                <p
                                  className={`mt-1 text-[10px] font-semibold leading-tight line-clamp-1 ${
                                    isActive ? 'text-[#065F46]' : 'text-[#475569]'
                                  }`}
                                >
                                  {s.title}
                                </p>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })()}

          {/* ========================================================= */}
          {/* PASSO 4: ATIVAR O AO VIVO (WEBHOOK) & CONCLUIR PARA TRANSIÇÃO */}
          {/* ========================================================= */}
          {currentStep === 4 && (
            <div className="space-y-4 animate-grow-up">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-[#CBD6D7]/80 bg-white/90 backdrop-blur-xs px-2.5 py-0.5 text-[11px] font-semibold tracking-wider text-[#353B47]">
                  <AppIcons.zernioGlobe className="h-3 w-3 text-[#10B981]" /> PASSO 4 DE 4
                </span>
                <h2 className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-[#2B303B]">
                  Ativar o ao vivo (Webhook)
                </h2>
                <p className="mt-1 text-sm text-[#353B47] leading-relaxed">
                  O webhook notifica o Alô instantaneamente assim que um cliente manda mensagem no
                  WhatsApp.
                </p>
              </div>

              <div className="rounded-2xl border border-[#CBD6D7] bg-white/90 backdrop-blur-sm p-4 space-y-2.5 shadow-2xs">
                <p className="text-xs text-[#353B47] leading-relaxed">
                  Sem isso, as mensagens só entram quando você sincronizar manualmente. Clique
                  abaixo para que o Alô cadastre a URL de webhook automaticamente na Zernio com 1
                  clique.
                </p>

                <div className="pt-0.5 space-y-2">
                  <Button
                    onClick={handleSetupWebhook}
                    disabled={isRegisteringWebhook}
                    className="bg-[#2B303B] hover:bg-[#1E232A] text-white text-xs font-bold px-4 h-9 shadow-xs rounded-xl"
                  >
                    {isRegisteringWebhook ? (
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
                  <p className="text-[11px] text-[#7A838D] font-mono select-all break-all">
                    URL destino:{' '}
                    <span className="text-[#353B47] font-semibold">
                      https://atendente-de-whatsapp-04cc6.shrd00.internal.goskip.dev/backend/v1/zernio/webhook?user_id=...
                    </span>
                  </p>
                </div>
              </div>

              {/* Feedback verde ou erro */}
              {webhookResult && (
                <div
                  className={`rounded-2xl border p-3.5 text-xs backdrop-blur-xs ${
                    webhookResult.success
                      ? 'border-[#BDE3D5] bg-[#F1FAF7] text-[#1E4D3A]'
                      : 'border-[#F2D6D3] bg-[#FEF6F5] text-[#991B1B]'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {webhookResult.success ? (
                      <AppIcons.checkCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#10B981]" />
                    ) : (
                      <AppIcons.warningCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#DC2626]" />
                    )}
                    <p className="font-bold leading-relaxed">{webhookResult.message}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rodapé Fixo de Ações na base do modal para todos os passos */}
        <div className="shrink-0 border-t border-[#CBD6D7]/60 bg-white/90 backdrop-blur-md px-5 py-3.5 sm:px-7 sm:py-3.5">
          {currentStep === 1 && (
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#475569]">Leva menos de 2 minutos</span>
              <Button
                onClick={() => goToStep(2)}
                className="bg-[#2B303B] hover:bg-[#1E232A] text-white text-xs px-5 h-9 font-bold shadow-xs cursor-pointer"
              >
                Começar <AppIcons.arrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          {currentStep === 2 && (
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={() => goToStep(1)}
                className="border-[#CBD6D7] text-xs h-9 px-4 text-[#353B47] font-semibold bg-white hover:bg-slate-50 cursor-pointer"
              >
                <AppIcons.arrowLeft className="mr-1.5 h-3.5 w-3.5" /> Voltar
              </Button>
              <Button
                onClick={() => goToStep(3)}
                disabled={!testResult?.success}
                className="bg-[#2B303B] hover:bg-[#1E232A] text-white text-xs px-5 h-9 font-bold disabled:opacity-50 shadow-xs cursor-pointer"
              >
                Avançar para Conectar WhatsApp{' '}
                <AppIcons.arrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          {currentStep === 3 && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => goToStep(2)}
                  className="border-[#CBD6D7] text-xs h-9 px-4 text-[#353B47] font-semibold bg-white hover:bg-slate-50 rounded-xl cursor-pointer"
                >
                  <AppIcons.arrowLeft className="mr-1.5 h-3.5 w-3.5" /> Voltar
                </Button>

                <a
                  href={ZERNIO_REFERRAL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#2C8A55] bg-white px-3.5 h-9 text-xs font-bold text-[#1E4D3A] hover:bg-[#F0FAF4] transition-all shadow-2xs"
                >
                  <span>Abrir Zernio</span>
                  <ZernioLogo height={12} raw className="translate-y-[0.5px]" />
                  <span className="text-[11px]">↗</span>
                </a>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  onClick={() => goToStep(4)}
                  className="text-xs font-medium text-[#64748B] hover:text-[#2B303B] hover:bg-black/5 h-9 px-3 rounded-xl cursor-pointer"
                  title="Pular esta etapa e configurar o número mais tarde"
                >
                  Conectar depois
                </Button>

                <Button
                  onClick={() => goToStep(4)}
                  className="bg-[#10B981] hover:bg-[#059669] text-white text-xs px-5 h-9 font-bold shadow-xs rounded-xl cursor-pointer"
                >
                  <AppIcons.check className="mr-1.5 h-3.5 w-3.5 stroke-[2.5]" />
                  Já conectei meu número
                  <AppIcons.arrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={() => goToStep(3)}
                className="border-[#CBD6D7] text-xs h-9 px-4 text-[#353B47] font-semibold bg-white hover:bg-slate-50 cursor-pointer"
              >
                <AppIcons.arrowLeft className="mr-1.5 h-3.5 w-3.5" /> Voltar
              </Button>
              <Button
                onClick={handleProceedToTransition}
                className="bg-[#10B981] hover:bg-[#059669] text-white text-xs px-6 h-9 font-bold shadow-md rounded-xl transition-all hover:scale-[1.02] cursor-pointer"
              >
                Concluir e montar minha inbox
                <AppIcons.arrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox Modal para visualização ampliada das capturas reais (renderizado via portal no document.body para ficar acima de todos os modais) */}
      {typeof document !== 'undefined' &&
        lightboxImage &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 p-4 sm:p-8 backdrop-blur-md animate-fade-in"
            onClick={() => setLightboxImage(null)}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="relative max-w-5xl w-full flex flex-col bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header do Lightbox */}
              <div className="flex items-center justify-between px-4 py-3 bg-slate-950/80 border-b border-slate-800 text-white">
                <div className="min-w-0 pr-4">
                  <p className="text-xs sm:text-sm font-bold text-white truncate">
                    {lightboxImage.title}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">{lightboxImage.desc}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setLightboxImage(null)}
                  className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                  aria-label="Fechar ampliação"
                >
                  <AppIcons.close className="h-4 w-4" />
                </button>
              </div>

              {/* Imagem ampliada */}
              <div className="relative overflow-auto max-h-[75vh] flex items-center justify-center p-2 bg-slate-950">
                <img
                  src={lightboxImage.src}
                  alt={lightboxImage.title}
                  className="max-h-[72vh] w-auto max-w-full object-contain rounded-lg shadow-lg"
                />
              </div>

              {/* Footer do Lightbox */}
              <div className="px-4 py-2.5 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                <span>Captura real do painel Zernio enviada para configuração</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setLightboxImage(null)}
                  className="h-7 text-xs border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white rounded-lg"
                >
                  Fechar (ESC)
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
