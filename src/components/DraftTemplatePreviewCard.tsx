import { useState, useMemo } from 'react'
import { AppIcons } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export interface DraftTemplateData {
  name: string
  category: string
  language: string
  headerText?: string
  bodyText: string
  footerText?: string
  examples: Record<string, string>
  exampleFilledText?: string
  buttons?: Array<{
    type?: string
    text?: string
    url?: string
    phone_number?: string
  }>
  actionId?: string
  actionStatus?: string
  actionError?: string
}

interface DraftTemplatePreviewCardProps {
  draft: DraftTemplateData
  onSendToMeta: (draft: DraftTemplateData) => void
  onRequestChanges: (feedback?: string) => void
  disabled?: boolean
  isSubmitting?: boolean
}

/**
 * Card visual de Rascunho de Template apresentado pelo Agente durante a entrevista.
 * Apresenta o corpo do template com as variáveis {{1}}, {{2}} destacadas
 * e a versão de exemplo preenchida simulando a mensagem no WhatsApp do cliente,
 * com os botões "Manda pra Meta" e "Fazer alteração".
 */
export function DraftTemplatePreviewCard({
  draft,
  onSendToMeta,
  onRequestChanges,
  disabled = false,
  isSubmitting = false,
}: DraftTemplatePreviewCardProps) {
  const [activeTab, setActiveTab] = useState<'preview' | 'template'>('preview')
  const [showFeedbackInput, setShowFeedbackInput] = useState(false)
  const [feedbackText, setFeedbackText] = useState('')

  const isCompleted = draft.actionStatus === 'completed'
  const isFailed = draft.actionStatus === 'failed'
  const isRejected = draft.actionStatus === 'rejected'

  const category = (draft.category || 'UTILITY').toUpperCase()
  const language = draft.language || 'pt_BR'
  const templateName = draft.name || 'template_sugerido'
  const buttons = draft.buttons || []

  // Calcular texto preenchido de exemplo se não foi fornecido pronto
  const filledExample = useMemo(() => {
    if (draft.exampleFilledText && draft.exampleFilledText.trim()) {
      return draft.exampleFilledText.trim()
    }

    let text = draft.bodyText || ''
    const ex = draft.examples || {}

    return text.replace(/\{\{\s*(\d+|\w+)\s*\}\}/g, (_match, varKey) => {
      const sample =
        ex[varKey] ||
        (varKey === '1'
          ? 'Carlos'
          : varKey === '2'
            ? 'Amanhã às 14:30'
            : varKey === '3'
              ? 'Rua das Flores, 123'
              : `[Amostra ${varKey}]`)
      return sample
    })
  }, [draft.bodyText, draft.examples, draft.exampleFilledText])

  // Renderizar o texto com variáveis {{1}} destacadas
  const renderTemplateWithHighlights = (rawText: string) => {
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
      const sample = draft.examples?.[varKey]
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
              className="inline-flex items-center gap-1 rounded bg-amber-100/90 px-1 py-0.5 font-semibold text-amber-900 border border-amber-300/70 mx-0.5 text-[11px]"
              title={p.sample ? `Exemplo: "${p.sample}"` : 'Variável da Meta'}
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

  const handleConfirmChanges = () => {
    const text = feedbackText.trim()
    onRequestChanges(text)
    setShowFeedbackInput(false)
    setFeedbackText('')
  }

  return (
    <div className="my-3 w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-xs transition-all ring-1 ring-violet-100">
      {/* Banner de Rascunho / Fase de Entrevista */}
      <div className="flex items-center justify-between gap-2 border-b border-violet-100 bg-gradient-to-r from-violet-50/90 to-indigo-50/90 px-3 sm:px-4 py-2.5 text-xs min-w-0">
        <div className="flex items-center gap-2 font-semibold text-violet-950 min-w-0">
          <span className="flex h-2 w-2 shrink-0 rounded-full bg-violet-600 animate-pulse" />
          <AppIcons.aiSparkle className="h-4 w-4 shrink-0 text-violet-600" />
          <span className="truncate leading-snug">
            Rascunho de Template (Prévia antes de enviar à Meta)
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Badge
            variant="outline"
            className="text-[10px] font-mono uppercase tracking-wider bg-white/90 text-violet-700 border-violet-200 shrink-0"
          >
            Rascunho
          </Badge>
        </div>
      </div>

      {/* Metadados Técnicos do Rascunho */}
      <div className="p-3 sm:p-4 space-y-3 min-w-0">
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

        {/* Abas: Exemplo Real no WhatsApp vs. Template Bruto com Variáveis */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 border-b border-[#E8EFF0] pb-1.5 pt-1 min-w-0">
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg w-full sm:w-auto overflow-x-auto min-w-0">
            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className={`flex-1 sm:flex-initial rounded-md px-2 sm:px-2.5 py-1 text-[10.5px] sm:text-[11px] font-medium transition-all whitespace-nowrap text-center ${
                activeTab === 'preview'
                  ? 'bg-white text-violet-900 shadow-2xs font-semibold'
                  : 'text-[#64748B] hover:text-[#334155]'
              }`}
            >
              Exemplo no WhatsApp
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('template')}
              className={`flex-1 sm:flex-initial rounded-md px-2 sm:px-2.5 py-1 text-[10.5px] sm:text-[11px] font-medium transition-all whitespace-nowrap text-center ${
                activeTab === 'template'
                  ? 'bg-white text-violet-900 shadow-2xs font-semibold'
                  : 'text-[#64748B] hover:text-[#334155]'
              }`}
            >
              Corpo com variáveis ({'{{1}}'})
            </button>
          </div>

          <span className="text-[10px] text-[#718096] italic self-end sm:self-auto shrink-0">
            WhatsApp Business
          </span>
        </div>

        {/* Balão WhatsApp de Simulação */}
        <div className="rounded-xl border border-[#D1D5DB] bg-[#EFEAE2] p-2.5 sm:p-3 shadow-inner min-w-0 overflow-hidden">
          <div className="relative w-full max-w-full sm:max-w-[90%] rounded-2xl rounded-tl-xs bg-white p-3 shadow-xs border border-black/5 space-y-2 min-w-0 overflow-hidden">
            {/* Cabeçalho */}
            {draft.headerText && (
              <div className="text-xs font-bold text-[#111827] border-b border-black/5 pb-1 break-words">
                {draft.headerText}
              </div>
            )}

            {/* Conteúdo da aba ativa */}
            {activeTab === 'preview' ? (
              <p className="whitespace-pre-wrap break-words leading-relaxed text-[#1F2937] text-xs">
                {filledExample}
              </p>
            ) : (
              <div className="break-words">{renderTemplateWithHighlights(draft.bodyText)}</div>
            )}

            {/* Rodapé */}
            {draft.footerText && (
              <div className="text-[10px] text-[#9CA3AF] pt-0.5 break-words">
                {draft.footerText}
              </div>
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
                    className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-[#F3F4F6] text-[#2563EB] text-[11px] font-medium border border-black/5 text-center break-words"
                  >
                    {btn.type === 'URL' && <AppIcons.externalLink className="h-3 w-3 shrink-0" />}
                    {btn.type === 'PHONE_NUMBER' && <AppIcons.phone className="h-3 w-3 shrink-0" />}
                    <span className="truncate">{btn.text || `Botão ${idx + 1}`}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Resultado real de submissão se houver */}
        {isCompleted && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-900 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold">
              <AppIcons.checkCircle className="h-4 w-4 text-emerald-600" />
              <span>Template criado e enviado à Meta via Zernio com sucesso!</span>
            </div>
            <p className="text-[11px] text-emerald-800">
              Status na Meta: <strong>PENDING / APPROVED</strong>.
            </p>
          </div>
        )}

        {isFailed && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-900 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold">
              <AppIcons.warningCircle className="h-4 w-4 text-rose-600" />
              <span>Falha na submissão à Meta:</span>
            </div>
            <p className="text-[11px] text-rose-800 font-mono break-words">
              {draft.actionError || 'Erro retornado pela API da Zernio/Meta.'}
            </p>
          </div>
        )}

        {isRejected && (
          <div className="rounded-xl bg-slate-100 border border-slate-200 p-2.5 text-xs text-slate-700">
            <p className="text-[11px]">
              <strong>Template recusado:</strong>{' '}
              {draft.actionError || 'Ajustes solicitados ao agente.'}
            </p>
          </div>
        )}

        {/* Interação do Usuário: "Manda pra Meta" OU "Fazer alteração" */}
        <div className="pt-2 border-t border-[#E8EFF0] space-y-2 min-w-0">
          {!isCompleted &&
            !isRejected &&
            (!showFeedbackInput ? (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 min-w-0">
                <span className="text-[11px] text-[#64748B] font-medium">
                  Gostou do texto e do exemplo?
                </span>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={disabled || isSubmitting}
                    onClick={() => setShowFeedbackInput(true)}
                    className="h-11 sm:h-8 w-full sm:w-auto rounded-xl border-[#CBD6D7] text-xs font-semibold text-[#464B5F] hover:bg-violet-50 hover:text-violet-700 hover:border-violet-200 shrink-0"
                  >
                    <AppIcons.messageMore className="mr-1.5 h-4 w-4 sm:h-3.5 sm:w-3.5 text-violet-600 shrink-0" />
                    <span>Fazer alteração</span>
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    disabled={disabled || isSubmitting}
                    onClick={() => onSendToMeta(draft)}
                    className="h-11 sm:h-8 w-full sm:w-auto rounded-xl bg-gradient-to-r from-[#10B981] to-[#059669] text-xs font-semibold text-white shadow-xs hover:opacity-95 shrink-0"
                  >
                    {isSubmitting ? (
                      <>
                        <AppIcons.spinner className="mr-1.5 h-4 w-4 sm:h-3.5 sm:w-3.5 animate-spin shrink-0" />
                        <span>Enviando à Meta...</span>
                      </>
                    ) : (
                      <>
                        <AppIcons.send className="mr-1.5 h-4 w-4 sm:h-3.5 sm:w-3.5 shrink-0" />
                        <span>Manda pra Meta</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2 rounded-xl bg-[#F8FAFB] p-3 border border-[#CBD6D7] min-w-0">
                <label className="block text-[11px] font-medium text-[#464B5F]">
                  O que você gostaria de alterar no template?
                </label>
                <input
                  type="text"
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleConfirmChanges()
                    }
                  }}
                  placeholder="Ex: mudar o tom para mais formal, trocar a variável 2, adicionar botão de SIM/NÃO..."
                  className="w-full rounded-lg border border-[#CBD6D7] bg-white px-2.5 py-2 sm:py-1.5 text-xs text-[#2D3748] focus:outline-hidden focus:ring-1 focus:ring-violet-400"
                  autoFocus
                />
                <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center sm:justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowFeedbackInput(false)}
                    className="h-10 sm:h-7 text-xs text-[#718096] w-full sm:w-auto"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={disabled || isSubmitting || !feedbackText.trim()}
                    onClick={handleConfirmChanges}
                    className="h-10 sm:h-7 bg-violet-600 text-xs font-semibold text-white hover:bg-violet-700 w-full sm:w-auto"
                  >
                    Enviar alterações
                  </Button>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}
