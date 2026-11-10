import { useEffect, useRef, useState } from 'react'
import { AppIcons } from '@/lib/icons'
import { ShinyText } from '@/components/reactbits/ShinyText'

export default function Composer({
  conversationId,
  draft,
  generating,
  onDraftChange,
  onSuggest,
  onCopy,
  onMarkResponded,
}: {
  conversationId: string
  draft: string
  generating: boolean
  onDraftChange: (value: string) => void
  onSuggest: () => void
  onCopy: () => void
  onMarkResponded: () => void
}) {
  const [tab, setTab] = useState<'rascunho' | 'nota'>('rascunho')
  const [note, setNote] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      const typing =
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable
      if (typing) return
      if (event.key.toLowerCase() === 'r') {
        event.preventDefault()
        setTab('rascunho')
        textareaRef.current?.focus()
      }
      if (event.key.toLowerCase() === 'n') {
        event.preventDefault()
        setTab('nota')
        textareaRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  useEffect(() => {
    if (generating) textareaRef.current?.focus()
  }, [generating])

  return (
    <section className="composer" aria-label="Editor de rascunho">
      <div className="composer-tabs">
        <button
          type="button"
          className={tab === 'rascunho' ? 'active' : ''}
          onClick={() => setTab('rascunho')}
        >
          Rascunho <kbd>R</kbd>
        </button>
        <button
          type="button"
          className={tab === 'nota' ? 'active' : ''}
          onClick={() => setTab('nota')}
        >
          Nota <kbd>N</kbd>
        </button>
        <span className="composer-readonly">
          <AppIcons.check size={13} /> Nada será enviado
        </span>
      </div>
      <div className={`composer-field ${generating ? 'generating' : ''}`}>
        {generating ? (
          <div className="generating-state" role="status">
            <span className="spinner ochre" />
            <ShinyText
              text="Gerando sua resposta…"
              color="#464B5F"
              shineColor="#CBD6D7"
              speed={2}
            />
          </div>
        ) : (
          <textarea
            key={conversationId}
            ref={textareaRef}
            rows={3}
            value={tab === 'rascunho' ? draft : note}
            onChange={(event) => {
              if (tab === 'rascunho') onDraftChange(event.target.value)
              else setNote(event.target.value)
            }}
            placeholder={
              tab === 'rascunho' ? 'Escreva ou peça uma sugestão…' : 'Escreva uma nota privada…'
            }
          />
        )}
        <div className="composer-actions">
          {tab === 'rascunho' && !draft && (
            <button
              className="suggest-button"
              type="button"
              disabled={generating}
              onClick={onSuggest}
            >
              {generating ? (
                <>
                  <AppIcons.aiSparkle size={15} className="animate-spin text-[#E5A14C]" />
                  <ShinyText
                    text="Gerando resposta…"
                    color="#464B5F"
                    shineColor="#CBD6D7"
                    speed={2}
                  />
                </>
              ) : (
                <>
                  <AppIcons.aiSparkle size={15} /> Sugerir resposta
                </>
              )}
            </button>
          )}
          {tab === 'rascunho' && draft && (
            <>
              <button className="primary-button copy-button" type="button" onClick={onCopy}>
                <AppIcons.copy size={15} /> Copiar
              </button>
              <button className="mark-text-button" type="button" onClick={onMarkResponded}>
                Marcar como respondida
              </button>
              <button
                className="regenerate-button"
                type="button"
                disabled={generating}
                onClick={onSuggest}
              >
                {generating ? (
                  <>
                    <AppIcons.aiSparkle size={14} className="animate-spin text-[#E5A14C]" />
                    <ShinyText
                      text="Gerando resposta…"
                      color="#464B5F"
                      shineColor="#CBD6D7"
                      speed={2}
                    />
                  </>
                ) : (
                  <>
                    <AppIcons.aiSparkle size={14} /> Sugerir outra
                  </>
                )}
              </button>
            </>
          )}
          {tab === 'nota' && (
            <span className="note-helper">A nota fica apenas neste editor e não é enviada.</span>
          )}
        </div>
      </div>
    </section>
  )
}
