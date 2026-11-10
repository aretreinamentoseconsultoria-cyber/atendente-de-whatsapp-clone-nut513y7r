import { useState } from 'react'
import { AppIcons } from '@/lib/icons'
import type { ToolCallUIState } from '@/services/agent'

interface ToolCallsViewProps {
  toolCalls: ToolCallUIState[]
  isStreaming?: boolean
}

export function ToolCallsView({ toolCalls, isStreaming }: ToolCallsViewProps) {
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({})

  if (toolCalls.length === 0) return null

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  const getToolMeta = (toolName: string) => {
    switch (toolName) {
      case 'conversations':
        return {
          icon: <AppIcons.chatBubble className="h-3.5 w-3.5 text-blue-500" />,
          runningLabel: 'Consultando conversas...',
          successLabel: 'Conversas consultadas',
          failLabel: 'Falha ao consultar conversas',
        }
      case 'messages':
        return {
          icon: <AppIcons.messageMore className="h-3.5 w-3.5 text-indigo-500" />,
          runningLabel: 'Buscando histórico de mensagens...',
          successLabel: 'Histórico de mensagens carregado',
          failLabel: 'Falha ao buscar mensagens',
        }
      case 'follow_ups':
        return {
          icon: <AppIcons.queueFollowUps className="h-3.5 w-3.5 text-amber-500" />,
          runningLabel: 'Verificando tarefas e follow-ups...',
          successLabel: 'Follow-ups verificados',
          failLabel: 'Falha ao verificar follow-ups',
        }
      case 'agent_actions':
        return {
          icon: <AppIcons.aiSparkle className="h-3.5 w-3.5 text-violet-500" />,
          runningLabel: 'Preparando proposta de ação Zernio...',
          successLabel: 'Ação Zernio processada',
          failLabel: 'Falha na ação Zernio',
        }
      default:
        return {
          icon: <AppIcons.moduleAgent className="h-3.5 w-3.5 text-slate-500" />,
          runningLabel: `Executando ${toolName}...`,
          successLabel: `${toolName} concluído`,
          failLabel: `Falha em ${toolName}`,
        }
    }
  }

  return (
    <div
      className="my-2 space-y-1.5 w-full max-w-full min-w-0"
      aria-label="Ferramentas executadas pelo agente"
    >
      {toolCalls.map((tc) => {
        const meta = getToolMeta(tc.name)
        const isRunning = tc.status === 'running'
        const isSuccess = tc.status === 'completed'
        const isExpanded = Boolean(expandedIds[tc.id])
        const hasDetails = Boolean(
          tc.actionRecord?.params || tc.actionRecord?.error_message || tc.actionRecord?.result,
        )

        return (
          <div
            key={tc.id}
            className={`rounded-xl border transition-all overflow-hidden w-full min-w-0 ${
              isRunning
                ? 'border-violet-200 bg-gradient-to-r from-violet-50/70 to-indigo-50/40 shadow-2xs'
                : isSuccess
                  ? 'border-[#E2E8F0] bg-slate-50/90 text-slate-700'
                  : 'border-rose-200 bg-rose-50/60 text-rose-900'
            }`}
          >
            {/* Header da Tool Call */}
            <div
              onClick={() => hasDetails && toggleExpand(tc.id)}
              className={`flex items-center justify-between gap-2 px-3 py-2 text-xs select-none min-w-0 ${
                hasDetails ? 'cursor-pointer hover:bg-black/2' : ''
              }`}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {isRunning ? (
                  <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
                    <AppIcons.spinner className="h-3.5 w-3.5 animate-spin text-violet-600" />
                  </span>
                ) : isSuccess ? (
                  <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                    ✓
                  </span>
                ) : (
                  <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold">
                    ✗
                  </span>
                )}

                <div className="flex items-center gap-1.5 min-w-0 truncate">
                  <span className="shrink-0">{meta.icon}</span>
                  <span
                    className={`truncate text-xs font-medium ${
                      isRunning ? 'text-violet-900 font-semibold' : 'text-[#475569]'
                    }`}
                  >
                    {isRunning ? meta.runningLabel : isSuccess ? meta.successLabel : meta.failLabel}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 ml-1">
                {isRunning && isStreaming && (
                  <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-medium text-violet-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-violet-500 animate-ping" />
                    executando
                  </span>
                )}

                {hasDetails && (
                  <span className="text-[10px] font-medium text-slate-400 flex items-center gap-1 hover:text-slate-600 shrink-0">
                    <span>{isExpanded ? 'Ocultar' : 'Detalhes'}</span>
                    <span
                      className={`inline-block transition-transform duration-150 ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                    >
                      ▾
                    </span>
                  </span>
                )}
              </div>
            </div>

            {/* Painel colapsável de detalhes */}
            {isExpanded && hasDetails && (
              <div className="border-t border-black/5 bg-white/80 p-2.5 text-[11px] font-mono text-slate-700 space-y-1.5 min-w-0 overflow-hidden">
                {tc.actionRecord?.action_type && (
                  <div className="break-words">
                    <span className="text-slate-500 font-sans">Ação: </span>
                    <span className="font-semibold text-violet-700 break-all">
                      {tc.actionRecord.action_type}
                    </span>
                  </div>
                )}

                {tc.actionRecord?.params && (
                  <div className="min-w-0">
                    <div className="text-slate-500 font-sans mb-0.5">Parâmetros:</div>
                    <pre className="p-2 rounded bg-slate-100 text-[10px] overflow-x-auto text-slate-800 whitespace-pre-wrap break-all max-w-full">
                      {JSON.stringify(tc.actionRecord.params, null, 2)}
                    </pre>
                  </div>
                )}

                {tc.actionRecord?.error_message && (
                  <div className="text-rose-700 bg-rose-50 p-2 rounded border border-rose-200 break-words">
                    <div className="font-sans font-semibold mb-0.5">Erro detalhado:</div>
                    <div className="text-[10px] break-all">{tc.actionRecord.error_message}</div>
                  </div>
                )}

                {tc.actionRecord?.result && (
                  <div className="min-w-0">
                    <div className="text-slate-500 font-sans mb-0.5">Resultado retornado:</div>
                    <pre className="p-2 rounded bg-slate-100 text-[10px] overflow-x-auto text-slate-800 whitespace-pre-wrap break-all max-w-full">
                      {JSON.stringify(tc.actionRecord.result, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
