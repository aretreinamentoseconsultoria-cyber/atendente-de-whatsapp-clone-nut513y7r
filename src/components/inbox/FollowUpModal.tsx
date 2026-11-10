import { useState } from 'react'
import { AppIcons } from '@/lib/icons'

export default function FollowUpModal({
  conversationName,
  loading,
  onClose,
  onCreate,
}: {
  conversationName: string
  loading: boolean
  onClose: () => void
  onCreate: (title: string, dueAt: string) => Promise<void>
}) {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
  tomorrow.setMinutes(tomorrow.getMinutes() - tomorrow.getTimezoneOffset())
  const [title, setTitle] = useState(`Retomar conversa com ${conversationName.split(' ')[0]}`)
  const [dueAt, setDueAt] = useState(tomorrow.toISOString().slice(0, 16))
  const [errors, setErrors] = useState<Record<string, string>>({})

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const next: Record<string, string> = {}
    if (!title.trim()) next.title = 'Informe um título para o acompanhamento.'
    if (!dueAt || Number.isNaN(new Date(dueAt).getTime())) next.dueAt = 'Informe um prazo válido.'
    if (Object.keys(next).length) {
      setErrors(next)
      return
    }
    setErrors({})
    try {
      await onCreate(title.trim(), new Date(dueAt).toISOString())
    } catch {
      setErrors({ form: 'Não foi possível criar o follow-up. Tente novamente.' })
    }
  }

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="modal-card followup-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="followup-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="modal-close" type="button" onClick={onClose} aria-label="Fechar">
          <AppIcons.close size={18} />
        </button>
        <span className="modal-icon">
          <AppIcons.queueFollowUps size={21} />
        </span>
        <p className="eyebrow">LEMBRETE</p>
        <h2 id="followup-title">Criar follow-up</h2>
        <p className="modal-description">Defina quando esta conversa deve voltar para sua fila.</p>
        <form className="auth-form" onSubmit={submit} noValidate>
          <label htmlFor="followup-name">Título</label>
          <input
            id="followup-name"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-invalid={Boolean(errors.title)}
          />
          {errors.title && <p className="field-error">{errors.title}</p>}
          <label htmlFor="followup-due">Prazo</label>
          <input
            id="followup-due"
            type="datetime-local"
            value={dueAt}
            onChange={(event) => setDueAt(event.target.value)}
            aria-invalid={Boolean(errors.dueAt)}
          />
          {errors.dueAt && <p className="field-error">{errors.dueAt}</p>}
          {errors.form && <p className="form-error">{errors.form}</p>}
          <div className="modal-actions">
            <button className="secondary-button" type="button" onClick={onClose}>
              Cancelar
            </button>
            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? (
                <>
                  <span className="spinner light" /> Criando…
                </>
              ) : (
                'Criar follow-up'
              )}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
