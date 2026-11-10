const mockConversations = [
  {
    initials: 'MA',
    name: 'Marcos Almeida',
    time: '26h',
    snippet: 'Quanto custa o plano pro time de 5 pessoas?',
    tag: 'Sem resposta há 26h',
    tone: 'critical',
  },
  {
    initials: 'RS',
    name: 'Ricardo Souza',
    time: '02:47',
    snippet: 'A equipe da madrugada segue sem receber…',
    tag: 'Madrugada',
    tone: 'night',
  },
  {
    initials: 'PL',
    name: 'Patrícia Lima',
    time: '2d',
    snippet: 'Enviei a proposta com as duas unidades.',
    tag: 'Vencido',
    tone: 'critical',
  },
]

export default function LandingMockup() {
  return (
    <div
      className="landing-mockup animate-fade-in-up"
      aria-label="Prévia da caixa de entrada priorizada"
    >
      <aside className="mock-rail">
        <div className="mock-rail-mark">◉</div>
        <span className="active" />
        <span />
        <span />
        <span />
      </aside>
      <section className="mock-list">
        <header>
          <div>
            <small>CAIXA DE ENTRADA</small>
            <strong>Prioridades de hoje</strong>
          </div>
          <span className="mock-counter">9</span>
        </header>
        {mockConversations.map((conversation, index) => (
          <article key={conversation.name} className={index === 0 ? 'selected' : ''}>
            <span className={`mock-avatar avatar-${index}`}>{conversation.initials}</span>
            <div className="mock-conversation-copy">
              <div className="mock-name-row">
                <strong>{conversation.name}</strong>
                <time>{conversation.time}</time>
              </div>
              <p>{conversation.snippet}</p>
              <span className={`priority-chip ${conversation.tone}`}>{conversation.tag}</span>
            </div>
          </article>
        ))}
      </section>
      <section className="mock-thread">
        <header>
          <div>
            <small>CONVERSA</small>
            <strong>Oi 👋 — Marcos</strong>
          </div>
          <span>Modo revisão</span>
        </header>
        <div className="mock-message">
          <span className="mock-avatar avatar-0">MA</span>
          <div>
            <small>Marcos Almeida · ontem, 14:32</small>
            <p>Oi! Vi o site de vocês, quanto custa o plano pro time de 5 pessoas?</p>
          </div>
        </div>
        <div className="mock-insight">
          <small>INTELIGÊNCIA DO LEAD</small>
          <p>Lead quente avaliando o plano para uma equipe de cinco pessoas.</p>
          <div>
            <span>● Quente</span>
            <span>Pediu orçamento</span>
          </div>
        </div>
        <div className="mock-composer">
          <span>
            Rascunho <kbd>R</kbd>
          </span>
          <p>Escreva ou peça uma sugestão…</p>
          <button tabIndex={-1}>Sugerir resposta</button>
        </div>
      </section>
    </div>
  )
}
