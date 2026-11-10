import { useState } from 'react'
import { AppIcons } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  approveAgentAction,
  rejectAgentAction,
  type AgentActionRecord,
  type ActionStatus,
} from '@/services/agent'

interface ActionProposalCardProps {
  action: AgentActionRecord
  onActionUpdated?: (updated: AgentActionRecord) => void
  onRejectFeedback?: (actionId: string, feedback: string) => void
}

export function ActionProposalCard({
  action,
  onActionUpdated,
  onRejectFeedback,
}: ActionProposalCardProps) {
  const [loading, setLoading] = useState(false)
  const [currentAction, setCurrentAction] = useState<AgentActionRecord>(action)
  const [showRejectInput, setShowRejectInput] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const params = currentAction.params || {}
  const isTemplate = currentAction.action_type === 'create_zernio_template'
  const isMessage = currentAction.action_type === 'send_zernio_message'

  // Dados do Template
  const templateName = String(
    params.name || params.template_name || params.templateName || 'template_sem_nome',
  )
  const category = String(params.category || 'UTILITY').toUpperCase()
  const language = String(params.language || 'pt_BR')
  const headerText = String(params.header_text || params.headerText || params.header || '')
  const footerText = String(params.footer_text || params.footerText || params.footer || '')
  const bodyRaw = String(params.body || params.text || params.content || '')
  const examples = (params.examples || params.example_values || {}) as Record<string, string>
  const buttons = (Array.isArray(params.buttons) ? params.buttons : []) as Array<{
    type?: string
    text?: string
    url?: string
    phone_number?: string
  }>

  // Dados de Mensagem
  const messageText = String(params.message || params.text || params.body || '')
  const phone = String(params.phone || params.recipient || params.to || '')
  const recipientName = String(params.recipientName || params.contactName || '')
  const msgTemplateName = String(params.templateName || params.template_name || '')

  // Renderizar corpo com variáveis realçadas e valores de exemplo
  const renderBodyWithVariables = (rawText: string) => {
    if (!rawText) return null
    const parts: Array<{ text: string; isVar: boolean; sample?: string }> = []
    const regex = /\{\{\s*(\d+|\w+)\s*\}\}/g
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = regex.exec(rawText)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ text: rawText.slice(lastIndex, match.index), isVar: false })
      }
      const varKey = match[1]
      const sample =
        examples[varKey] || (varKey === '1' ? 'João' : varKey === '2' ? '1234' : undefined)
      parts.push({ text: match[0], isVar: true, sample })
      lastIndex = regex.lastIndex
    }

    if (lastIndex < rawText.length) {
      parts.push({ text: rawText.slice(lastIndex), isVar: false })
    }

    return (
      <p className="whitespace-pre-wrap leading-relaxed text-[#1F2937] text-xs">
        {parts.map((p, i) =>
          p.isVar ? (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded bg-amber-100/90 px-1 py-0.5 font-semibold text-amber-900 border border-amber-300/60 mx-0.5 text-[11px]"
              title={p.sample ? `Exemplo: "${p.sample}"` : 'Variável WhatsApp'}
            >
              <span>{p.text}</span>
              {p.sample && (
                <span className="text-[10px] text-amber-700 font-normal">({p.sample})</span>
              )}
            </span>
          ) : (
            <span key={i}>{p.text}</span>
          ),
        )}
      </p>
    )
  }

  const handleApprove = async () => {
    setLoading(true)
    try {
      const res = await approveAgentAction(currentAction.id)
      const updatedRecord: AgentActionRecord = res.record || {
        ...currentAction,
        status: res.status as ActionStatus,
        error_message: res.error_message || '',
      }
      setCurrentAction(updatedRecord)
      onActionUpdated?.(updatedRecord)

      if (res.status === 'completed') {
        toast.success(
          isTemplate
            ? 'Template aprovado e submetido com sucesso à Meta via Zernio!'
            : 'Mensagem aprovada e enviada com sucesso ao contato!',
        )
      } else if (res.status === 'failed') {
        toast.error(res.error_message || 'Ação falhou ao ser executada na Zernio.')
      } else {
        toast.info('Ação aprovada e em processamento.')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao aprovar ação.'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleReject = async () => {
    setLoading(true)
    try {
      const reason = rejectReason.trim() || 'Ação recusada pelo usuário.'
      await rejectAgentAction(currentAction.id, reason)
      const updatedRecord: AgentActionRecord = {
        ...currentAction,
        status: 'rejected',
        error_message: reason,
      }
      setCurrentAction(updatedRecord)
      onActionUpdated?.(updatedRecord)
      onRejectFeedback?.(currentAction.id, reason)
      setShowRejectInput(false)
      toast.info('Proposta recusada. Nenhuma ação externa foi executada.')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao recusar ação.'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  const isPendingApproval = currentAction.status === 'pending_approval'
  const isExecuting = currentAction.status === 'pending'
  const isCompleted = currentAction.status === 'completed'
  const isFailed = currentAction.status === 'failed'
  const isRejected = currentAction.status === 'rejected'

  return (
    <div className="my-3 w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-[#CBD6D7] bg-white shadow-xs transition-all hover:border-[#A0AEC0]">
      {/* Top Banner de Proposta / Workflow */}
      <div
        className={`flex items-center justify-between gap-2 border-b px-3 sm:px-4 py-2.5 text-xs font-semibold min-w-0 ${
          isPendingApproval
            ? 'bg-amber-50/80 border-amber-200/80 text-amber-900'
            : isExecuting
              ? 'bg-blue-50/80 border-blue-200/80 text-blue-900'
              : isCompleted
                ? 'bg-emerald-50/80 border-emerald-200/80 text-emerald-900'
                : isFailed
                  ? 'bg-rose-50/80 border-rose-200/80 text-rose-900'
                  : 'bg-slate-100 border-slate-200 text-slate-700'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {isPendingApproval && (
            <span className="flex h-2 w-2 shrink-0 rounded-full bg-amber-500 animate-pulse" />
          )}
          {isExecuting && (
            <AppIcons.spinner className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-600" />
          )}
          {isCompleted && <AppIcons.checkCircle className="h-4 w-4 shrink-0 text-emerald-600" />}
          {isFailed && <AppIcons.warningCircle className="h-4 w-4 shrink-0 text-rose-600" />}
          {isRejected && <AppIcons.close className="h-4 w-4 shrink-0 text-slate-500" />}
          <span className="truncate leading-snug">
            {isPendingApproval && 'Proposta aguardando sua validação'}
            {isExecuting && 'Executando ação na Zernio...'}
            {isCompleted &&
              (isTemplate ? 'Template submetido à Meta' : 'Mensagem enviada com sucesso')}
            {isFailed && 'Falha na execução — ver detalhes'}
            {isRejected && 'Proposta recusada por você'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Badge
            variant="outline"
            className="text-[10px] font-mono uppercase tracking-wider bg-white/70 shrink-0"
          >
            {isTemplate ? 'Template Zernio' : 'WhatsApp Direto'}
          </Badge>
        </div>
      </div>

      {/* Conteúdo da Proposta */}
      <div className="p-3 sm:p-4 space-y-3 min-w-0">
        {/* Metadados Técnicos */}
        {isTemplate && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 rounded-xl bg-[#F8FAFB] p-2.5 text-[11px] border border-[#E2E8F0] min-w-0">
            <div className="min-w-0">
              <span className="block text-[10px] font-medium text-[#718096]">Nome técnico:</span>
              <strong
                className="font-mono text-[#2D3748] truncate block break-all"
                title={templateName}
              >
                {templateName}
              </strong>
            </div>
            <div className="min-w-0">
              <span className="block text-[10px] font-medium text-[#718096]">Categoria:</span>
              <span className="inline-block rounded bg-indigo-50 px-1.5 py-0.5 font-semibold text-indigo-700 text-[10px] border border-indigo-200">
                {category}
              </span>
            </div>
            <div className="min-w-0">
              <span className="block text-[10px] font-medium text-[#718096]">Idioma:</span>
              <span className="font-medium text-[#2D3748]">{language}</span>
            </div>
          </div>
        )}

        {isMessage && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-xl bg-[#F8FAFB] p-2.5 text-[11px] border border-[#E2E8F0] min-w-0">
            <div className="min-w-0">
              <span className="block text-[10px] font-medium text-[#718096]">Destinatário:</span>
              <strong className="text-[#2D3748] truncate block break-all">
                {recipientName ? `${recipientName} (${phone})` : phone || 'Contato selecionado'}
              </strong>
            </div>
            <div className="min-w-0">
              <span className="block text-[10px] font-medium text-[#718096]">Via:</span>
              <span className="font-medium text-[#2D3748] break-words">
                {msgTemplateName
                  ? `Template (${msgTemplateName})`
                  : 'Mensagem de texto (sessão 24h)'}
              </span>
            </div>
          </div>
        )}

        {/* PRÉVIA FIEL DO WHATSAPP (Balão clássico do WhatsApp) */}
        <div className="space-y-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 text-[11px] text-[#718096] min-w-0">
            <span className="font-medium truncate">
              Prévia como aparecerá no WhatsApp do cliente:
            </span>
            <span className="text-[10px] italic self-end sm:self-auto shrink-0">
              WhatsApp Business
            </span>
          </div>

          <div className="rounded-xl border border-[#D1D5DB] bg-[#EFEAE2] p-2.5 sm:p-3 shadow-inner min-w-0 overflow-hidden">
            {/* Balão do WhatsApp */}
            <div className="relative w-full max-w-full sm:max-w-[90%] rounded-2xl rounded-tl-xs bg-white p-3 shadow-xs border border-black/5 space-y-2 min-w-0 overflow-hidden">
              {/* Header em negrito se houver */}
              {headerText && (
                <div className="text-xs font-bold text-[#111827] border-b border-black/5 pb-1 break-words">
                  {headerText}
                </div>
              )}

              {/* Corpo com variáveis realçadas */}
              {isTemplate && <div className="break-words">{renderBodyWithVariables(bodyRaw)}</div>}
              {isMessage && (
                <p className="whitespace-pre-wrap break-words leading-relaxed text-[#1F2937] text-xs">
                  {messageText ||
                    (msgTemplateName ? `[Disparo de template: ${msgTemplateName}]` : '')}
                </p>
              )}

              {/* Footer cinza */}
              {footerText && (
                <div className="text-[10px] text-[#9CA3AF] pt-0.5 break-words">{footerText}</div>
              )}

              {/* Timestamp e status de entrega WhatsApp */}
              <div className="flex justify-end items-center gap-1 text-[9px] text-[#9CA3AF]">
                <span>
                  {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="text-[#10B981]">✓✓</span>
              </div>

              {/* Botões do WhatsApp */}
              {buttons.length > 0 && (
                <div className="mt-2 pt-1 border-t border-[#E5E7EB] space-y-1">
                  {buttons.map((btn, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-[#F3F4F6] text-[#2563EB] text-[11px] font-medium hover:bg-[#E5E7EB] cursor-pointer transition-colors border border-black/5 text-center break-words"
                    >
                      {btn.type === 'URL' && <AppIcons.externalLink className="h-3 w-3 shrink-0" />}
                      {btn.type === 'PHONE_NUMBER' && (
                        <AppIcons.phone className="h-3 w-3 shrink-0" />
                      )}
                      <span className="truncate">{btn.text || `Botão ${idx + 1}`}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Exibição de Resultado / Erro Real */}
        {isCompleted && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-900 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold">
              <AppIcons.checkCircle className="h-4 w-4 text-emerald-600" />
              <span>
                {isTemplate
                  ? 'Template criado na Zernio e submetido para aprovação da Meta!'
                  : 'Mensagem enviada com sucesso!'}
              </span>
            </div>
            {isTemplate && (
              <p className="text-[11px] text-emerald-800">
                Status na Meta: <strong>PENDING / APPROVED</strong>. A Zernio sincronizará assim que
                a Meta aprovar.
              </p>
            )}
          </div>
        )}

        {isFailed && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-900 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold">
              <AppIcons.warningCircle className="h-4 w-4 text-rose-600" />
              <span>Falha na execução da ação:</span>
            </div>
            <p className="text-[11px] text-rose-800 font-mono break-words">
              {currentAction.error_message || 'Erro desconhecido retornado pela Zernio.'}
            </p>
          </div>
        )}

        {isRejected && (
          <div className="rounded-xl bg-slate-100 border border-slate-200 p-2.5 text-xs text-slate-700">
            <p className="text-[11px]">
              <strong>Proposta recusada:</strong>{' '}
              {currentAction.error_message || 'Recusada pelo usuário.'}
            </p>
          </div>
        )}

        {/* Interação do Usuário: Botões Aprovo / Não Aprovo */}
        {isPendingApproval && (
          <div className="pt-2 border-t border-[#E8EFF0] flex flex-col gap-2 min-w-0">
            {!showRejectInput ? (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2.5 sm:justify-end w-full">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={loading}
                  onClick={() => setShowRejectInput(true)}
                  className="h-11 sm:h-8 w-full sm:w-auto rounded-xl border-[#CBD6D7] text-xs font-semibold text-[#464B5F] hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 shrink-0"
                >
                  <AppIcons.close className="mr-1.5 h-4 w-4 sm:h-3.5 sm:w-3.5 text-rose-500 shrink-0" />
                  <span>Não aprovo</span>
                </Button>

                <Button
                  type="button"
                  size="sm"
                  disabled={loading}
                  onClick={handleApprove}
                  className="h-11 sm:h-8 w-full sm:w-auto rounded-xl bg-gradient-to-r from-[#10B981] to-[#059669] text-xs font-semibold text-white shadow-xs hover:opacity-95 shrink-0"
                >
                  {loading ? (
                    <AppIcons.spinner className="h-4 w-4 sm:h-3.5 sm:w-3.5 animate-spin mr-1.5 shrink-0" />
                  ) : (
                    <AppIcons.check className="mr-1.5 h-4 w-4 sm:h-3.5 sm:w-3.5 shrink-0" />
                  )}
                  <span>Aprovo</span>
                </Button>
              </div>
            ) : (
              <div className="space-y-2 rounded-xl bg-[#F8FAFB] p-3 sm:p-2.5 border border-[#CBD6D7] min-w-0">
                <label className="block text-[11px] font-medium text-[#464B5F]">
                  Motivo da recusa ou feedback de ajuste (opcional):
                </label>
                <input
                  type="text"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Ex: trocar o texto da variável, ajustar tom, etc..."
                  className="w-full rounded-lg border border-[#CBD6D7] bg-white px-2.5 py-2 sm:py-1.5 text-xs text-[#2D3748] focus:outline-hidden focus:ring-1 focus:ring-rose-400"
                />
                <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center sm:justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowRejectInput(false)}
                    className="h-10 sm:h-7 text-xs text-[#718096] w-full sm:w-auto"
                  >
                    Voltar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={loading}
                    onClick={handleReject}
                    className="h-10 sm:h-7 bg-rose-600 text-xs font-semibold text-white hover:bg-rose-700 w-full sm:w-auto"
                  >
                    {loading ? <AppIcons.spinner className="h-3 w-3 animate-spin mr-1" /> : null}
                    Confirmar recusa
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
