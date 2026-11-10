import { useState } from 'react'
import { AppIcons } from '@/lib/icons'
import { Link, useSearchParams } from 'react-router-dom'

import AuthPageShell from '@/components/AuthPageShell'
import { extractFieldErrors, getErrorMessage } from '@/lib/pocketbase/errors'
import { confirmPasswordReset } from '@/services/auth'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const nextErrors: Record<string, string> = {}
    if (password.length < 8) nextErrors.password = 'Use pelo menos 8 caracteres.'
    if (confirmation !== password) nextErrors.confirmation = 'As senhas não coincidem.'
    if (!token) nextErrors.form = 'Este link não possui um token válido.'
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      return
    }

    setLoading(true)
    setErrors({})
    try {
      await confirmPasswordReset(token, password, confirmation)
      setDone(true)
    } catch (error) {
      const fields = extractFieldErrors(error)
      setErrors({
        password: fields.password || 'Não foi possível validar esta senha.',
        confirmation: fields.passwordConfirm,
        form: getErrorMessage(error),
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthPageShell
      eyebrow="NOVA SENHA"
      title="Crie uma nova senha"
      description="Escolha uma nova senha para acessar sua conta."
    >
      {done ? (
        <div className="auth-complete">
          <AppIcons.checkCircle size={28} />
          <h2>Senha atualizada</h2>
          <p>Seu acesso está pronto novamente.</p>
          <Link className="primary-button" to="/">
            Entrar na conta
          </Link>
        </div>
      ) : (
        <form className="auth-form" onSubmit={submit} noValidate>
          <label htmlFor="new-password">Nova senha</label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={Boolean(errors.password)}
          />
          {errors.password && <p className="field-error">{errors.password}</p>}
          <label htmlFor="confirm-password">Confirmar nova senha</label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            aria-invalid={Boolean(errors.confirmation)}
          />
          {errors.confirmation && <p className="field-error">{errors.confirmation}</p>}
          {errors.form && <p className="form-error">{errors.form}</p>}
          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? (
              <>
                <span className="spinner light" /> Salvando…
              </>
            ) : (
              'Salvar nova senha'
            )}
          </button>
        </form>
      )}
    </AuthPageShell>
  )
}
