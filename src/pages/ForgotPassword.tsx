import { useState } from 'react'
import { AppIcons } from '@/lib/icons'

import AuthPageShell from '@/components/AuthPageShell'
import { requestPasswordReset } from '@/services/auth'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError('Informe um e-mail válido.')
      return
    }
    setLoading(true)
    try {
      await requestPasswordReset(email.trim())
    } catch {
      // A resposta permanece neutra para não confirmar se a conta existe.
    } finally {
      setSent(true)
      setLoading(false)
    }
  }

  return (
    <AuthPageShell
      eyebrow="RECUPERAR ACESSO"
      title="Redefina sua senha"
      description="Informe seu e-mail e enviaremos as próximas instruções."
    >
      {sent ? (
        <div className="auth-success" role="status">
          <AppIcons.email size={19} />
          <div>
            <strong>Confira sua caixa de entrada</strong>
            <p>Se houver uma conta para este e-mail, você receberá um link de redefinição.</p>
          </div>
        </div>
      ) : (
        <form className="auth-form" onSubmit={submit} noValidate>
          <label htmlFor="forgot-email">E-mail</label>
          <input
            id="forgot-email"
            type="email"
            autoComplete="email"
            placeholder="voce@empresa.com.br"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={Boolean(error)}
          />
          {error && <p className="field-error">{error}</p>}
          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? (
              <>
                <span className="spinner light" /> Enviando…
              </>
            ) : (
              'Enviar link de redefinição'
            )}
          </button>
        </form>
      )}
    </AuthPageShell>
  )
}
