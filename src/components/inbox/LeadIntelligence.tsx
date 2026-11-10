import { AppIcons } from '@/lib/icons'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Conversation } from '@/types/inbox'

interface LeadIntelligenceProps {
  conversation: Conversation
}

export function LeadIntelligence({ conversation }: LeadIntelligenceProps) {
  const temperature = conversation.temperature || 'morno'
  const TemperatureIcon =
    temperature === 'quente'
      ? AppIcons.tempHot
      : temperature === 'frio'
        ? AppIcons.tempCold
        : AppIcons.tempWarm
  const temperatureStyles =
    temperature === 'quente'
      ? 'border-[#F3D9B9] bg-[#FFF8EE] text-[#A86620]'
      : temperature === 'frio'
        ? 'border-[#D7E7EA] bg-[#F3F9FA] text-[#5C7D86]'
        : 'border-[#E8E0C5] bg-[#FBFAF2] text-[#8A7743]'

  return (
    <aside className="flex h-full w-[292px] shrink-0 flex-col border-l border-[#CBD6D7] bg-[#FBFBFB] max-2xl:w-[260px] max-xl:hidden">
      <header className="border-b border-[#DCE4E4] px-5 py-[18px]">
        <div className="flex items-center gap-2">
          <AppIcons.aiSparkle className="h-4 w-4 text-[#656E7D]" />
          <h2 className="text-sm font-semibold text-[#464B5F]">Inteligência do lead</h2>
        </div>
        <p className="mt-1 text-[11px] text-[#A3A5AF]">Leitura automática da conversa</p>
      </header>

      <ScrollArea className="flex-1">
        <div className="space-y-5 p-5">
          <div
            className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${temperatureStyles}`}
          >
            <TemperatureIcon className="h-4 w-4" />
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.12em] opacity-70">
                Temperatura
              </p>
              <p className="text-sm font-semibold capitalize">Lead {temperature}</p>
            </div>
          </div>

          <section>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#A3A5AF]">
              <AppIcons.summary className="h-3.5 w-3.5 text-[#F97316]" />
              Resumo
            </div>
            <p className="mt-2 text-[12px] leading-5 text-[#626A78]">
              {conversation.summary || 'Ainda não há um resumo disponível.'}
            </p>
          </section>

          <div className="border-t border-[#DEE5E5]" />

          <section>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#A3A5AF]">
              <AppIcons.intent className="h-3.5 w-3.5 text-[#3B82F6]" />
              Intenção detectada
            </div>
            <div className="mt-2 flex items-start gap-2 rounded-lg bg-white p-3 ring-1 ring-[#DFE6E6]">
              <AppIcons.aiSparkle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#E5A14C]" />
              <p className="text-[12px] font-medium leading-5 text-[#555D6C]">
                {conversation.intent || 'Entender a solução'}
              </p>
            </div>
          </section>

          <section>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#A3A5AF]">
              <AppIcons.nextAction className="h-3.5 w-3.5 text-[#8B5CF6]" />
              Próxima melhor ação
            </div>
            <div className="mt-2 rounded-xl border border-[#D8E2E2] bg-white p-3.5">
              <p className="text-[12px] leading-5 text-[#616977]">
                {conversation.next_action || 'Acompanhar a conversa e responder à próxima dúvida.'}
              </p>
              <div className="mt-3 flex items-center gap-1 text-[10px] font-semibold text-[#74808A]">
                Ação recomendada
                <AppIcons.arrowUpRight className="h-3 w-3" />
              </div>
            </div>
          </section>

          <div className="rounded-xl bg-[#F0F5F4] px-3.5 py-3 text-[10px] leading-4 text-[#77817F]">
            A análise orienta a resposta, mas você sempre revisa e envia pelo WhatsApp.
          </div>
        </div>
      </ScrollArea>
    </aside>
  )
}
