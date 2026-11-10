import { useState } from 'react'
import { AppIcons } from '@/lib/icons'
import { Link, useNavigate } from 'react-router-dom'
import { AloLogo } from '@/components/AloLogo'

import { useAuth } from '@/contexts/AuthContext'
import { extractFieldErrors } from '@/lib/pocketbase/errors'

type LoginErrors = { email?: string; password?: string; form?: string }

export default function LoginCard({ onCancel }: { onCancel?: () => void }) {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<LoginErrors>({})
  const [loading, setLoading] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const nextErrors: LoginErrors = {}
    if (!/^\S+@\S+\.\S+$/.test(email)) nextErrors.email = 'Informe um e-mail válido.'
    if (!password) nextErrors.password = 'Informe sua senha.'
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      return
    }

    setErrors({})
    setLoading(true)
    try {
      await login(email.trim(), password)
      navigate('/inbox', { replace: true })
    } catch (error) {
      const fieldErrors = extractFieldErrors(error)
      setErrors({
        email: fieldErrors.identity || 'Confira o e-mail informado.',
        password:
          fieldErrors.password || 'E-mail ou senha incorretos. Confira os dados e tente novamente.',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-card" id="login-card">
      <div className="mb-4 flex items-center justify-between">
        <AloLogo height={32} />
        {onCancel && (
          <button className="text-button" type="button" onClick={onCancel}>
            Fechar
          </button>
        )}
      </div>
      <div className="login-card-heading">
        <div>
          <p className="eyebrow">ACESSO SEGURO</p>
          <h2>Acesse o assistente</h2>
        </div>
      </div>
      <form className="auth-form" onSubmit={submit} noValidate>
        <label htmlFor="login-email">E-mail</label>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={Boolean(errors.email)}
        />
        {errors.email && <p className="field-error">{errors.email}</p>}

        <div className="password-label-row">
          <label htmlFor="login-password">Senha</label>
          <Link to="/forgot-password">Esqueci minha senha</Link>
        </div>
        <div className="password-field">
          <input
            id="login-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={Boolean(errors.password)}
          />
          <button
            type="button"
            aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            onClick={() => setShowPassword((visible) => !visible)}
          >
            {showPassword ? <AppIcons.eyeOff size={17} /> : <AppIcons.modeReadOnly size={17} />}
          </button>
        </div>
        {errors.password && <p className="field-error">{errors.password}</p>}
        {errors.form && <p className="form-error">{errors.form}</p>}
        <button className="primary-button" type="submit" disabled={loading}>
          {loading ? (
            <>
              <span className="spinner light" /> Entrando…
            </>
          ) : (
            'Entrar na caixa de entrada'
          )}
        </button>
      </form>
    </div>
  )
}
