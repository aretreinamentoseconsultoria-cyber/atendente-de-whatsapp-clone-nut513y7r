import { AppIcons } from '@/lib/icons'

const rows = [
  {
    initials: 'MC',
    name: 'Marina Costa',
    message: 'Existe alguma condição especial?',
    chip: '28h',
    active: true,
  },
  {
    initials: 'GA',
    name: 'Gustavo Almeida',
    message: 'Vocês integram com nosso CRM?',
    chip: 'Madrugada',
  },
  {
    initials: 'CN',
    name: 'Camila Nogueira',
    message: 'Vou validar com a diretoria.',
    chip: 'Follow-up',
  },
]

export function InboxMockup() {
  return (
    <div className="landing-mockup overflow-hidden rounded-[18px] border border-white/90 bg-white text-left shadow-[0_28px_80px_rgba(57,106,126,0.18)]">
      <div className="flex h-9 items-center border-b border-[#DFE8E8] bg-[#FBFCFC] px-3">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="h-2 w-2 rounded-full bg-[#E8B0A4]" />
          <span className="h-2 w-2 rounded-full bg-[#E5C57C]" />
          <span className="h-2 w-2 rounded-full bg-[#8DD3A2]" />
        </div>
        <div className="mx-auto flex items-center gap-1.5 text-[9px] font-medium text-[#89909C]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#57D067]" />
          Modo revisão
        </div>
      </div>

      <div className="grid h-[330px] grid-cols-[42px_220px_minmax(0,1fr)_180px] max-md:grid-cols-[38px_185px_minmax(260px,1fr)] max-sm:h-[250px] max-sm:grid-cols-[32px_150px_250px]">
        <aside className="flex flex-col items-center border-r border-[#DFE8E8] bg-[#F8FAFA] py-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#464B5F] text-[9px] font-bold text-white">
            A
          </div>
          <AppIcons.queueAll className="mt-5 h-3.5 w-3.5 text-[#464B5F]" />
          <AppIcons.queueTracking className="mt-4 h-3.5 w-3.5 text-[#A3A5AF]" />
        </aside>

        <section className="border-r border-[#DFE8E8] bg-white">
          <div className="border-b border-[#E6ECEC] p-3">
            <p className="text-[8px] font-semibold uppercase tracking-[0.13em] text-[#A3A5AF]">
              Fila priorizada
            </p>
            <div className="mt-1 flex items-center justify-between">
              <strong className="text-xs font-semibold text-[#3F4557]">Responder agora</strong>
              <span className="rounded-full bg-[#EEF2F2] px-1.5 py-0.5 text-[8px] text-[#65707B]">
                4
              </span>
            </div>
          </div>
          <div>
            {rows.map((row) => (
              <div
                key={row.name}
                className={`border-b border-[#EDF1F1] p-2.5 ${row.active ? 'bg-[#F0FAFC]' : ''}`}
              >
                <div className="flex items-start gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#ECF1EF] text-[8px] font-semibold text-[#5D6574]">
                    {row.initials}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <strong className="truncate text-[9px] font-semibold text-[#464B5F]">
                        {row.name}
                      </strong>
                      <span
                        className={`rounded px-1 py-0.5 text-[7px] ${row.chip === '28h' ? 'bg-red-50 text-red-600' : row.chip === 'Madrugada' ? 'bg-[#FFF5E7] text-[#B06D1F]' : 'bg-[#F0F3F3] text-[#747C86]'}`}
                      >
                        {row.chip}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[8px] text-[#969BA6]">{row.message}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="relative flex min-w-0 flex-col bg-[#FBFCFC]">
          <header className="flex h-12 items-center justify-between border-b border-[#DFE8E8] bg-white px-3">
            <div>
              <strong className="block text-[10px] font-semibold text-[#414859]">
                Marina Costa
              </strong>
              <span className="text-[8px] text-[#A3A5AF]">WhatsApp · +55 11 99999-1001</span>
            </div>
            <button className="rounded-md bg-[#464B5F] px-2 py-1 text-[8px] font-medium text-white">
              Sugerir resposta
            </button>
          </header>
          <div className="flex-1 space-y-2 p-4">
            <div className="max-w-[78%] rounded-lg rounded-bl-sm bg-[#EEF2F1] px-2.5 py-2 text-[8px] leading-4 text-[#555D6C]">
              O plano Pro atende nossas três unidades?
            </div>
            <div className="max-w-[82%] rounded-lg rounded-bl-sm bg-[#EEF2F1] px-2.5 py-2 text-[8px] leading-4 text-[#555D6C]">
              Se fecharmos esta semana, existe alguma condição especial?
            </div>
          </div>
          <div className="m-3 rounded-lg border border-[#D6E0E0] bg-white p-2.5">
            <div className="flex items-center gap-1 text-[8px] font-semibold text-[#596173]">
              <AppIcons.aiSparkle className="h-2.5 w-2.5 text-[#E5A14C]" /> Rascunho sugerido
            </div>
            <p className="mt-1.5 text-[8px] leading-3.5 text-[#7A808D]">
              Oi, Marina! Sim, o plano Pro foi pensado para operações como a sua...
            </p>
          </div>
        </section>

        <aside className="border-l border-[#DFE8E8] bg-white p-3 max-md:hidden">
          <div className="flex items-center gap-1.5 text-[9px] font-semibold text-[#454C5D]">
            <AppIcons.tempHot className="h-3 w-3 text-[#E5A14C]" /> Lead quente
          </div>
          <div className="mt-4">
            <p className="text-[7px] font-semibold uppercase tracking-wider text-[#A3A5AF]">
              Intenção
            </p>
            <p className="mt-1 text-[9px] font-medium text-[#596173]">Contratar o plano Pro</p>
          </div>
          <div className="mt-4 rounded-lg bg-[#F7F9F9] p-2.5">
            <p className="text-[7px] font-semibold uppercase tracking-wider text-[#A3A5AF]">
              Próxima ação
            </p>
            <p className="mt-1 text-[8px] leading-3.5 text-[#6C7380]">
              Enviar condições e sugerir uma demonstração hoje.
            </p>
            <AppIcons.arrowUpRight className="mt-2 h-3 w-3 text-[#8B929D]" />
          </div>
        </aside>
      </div>
    </div>
  )
}
