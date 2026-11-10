import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AppIcons } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'
import { authErrorDetails } from '@/services/auth'

interface AuthFormProps {
  onSuccess?: () => void
}

type Mode = 'login' | 'register'

export function AuthForm({ onSuccess }: AuthFormProps) {
  const navigate = useNavigate()
  const { login, register } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formMessage, setFormMessage] = useState('')
  const [verificationSent, setVerificationSent] = useState(false)

  const switchMode = (nextMode: Mode) => {
    setMode(nextMode)
    setFieldErrors({})
    setFormMessage('')
    setVerificationSent(false)
    if (nextMode === 'register') {
      setEmail('')
      setPassword('')
      setPasswordConfirm('')
    }
  }

  const validate = () => {
    const errors: Record<string, string> = {}
    if (mode === 'register' && !name.trim()) errors.name = 'Informe seu nome.'
    if (!email.trim()) errors.email = 'Informe seu e-mail.'
    if (!password) errors.password = 'Informe sua senha.'
    if (mode === 'register' && password.length < 8) errors.password = 'Use pelo menos 8 caracteres.'
    if (mode === 'register' && password !== passwordConfirm) {
      errors.passwordConfirm = 'As senhas não coincidem.'
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!validate()) return
    setLoading(true)
    setFormMessage('')
    try {
      if (mode === 'login') {
        await login(email, password)
        onSuccess?.()
        navigate('/inbox')
      } else {
        await register(name, email, password)
        onSuccess?.()
        navigate('/inbox')
      }
    } catch (error) {
      const details = authErrorDetails(error)
      setFieldErrors(details.fields)
      setFormMessage(details.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#57A873]">
          Atendente WhatsApp
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#273044]">
          {mode === 'login' ? 'Bem-vindo de volta' : 'Crie seu acesso'}
        </h2>
        <p className="mt-1.5 text-sm leading-6 text-[#73798A]">
          {mode === 'login'
            ? 'Entre para gerenciar seus atendimentos com o ciclo completo.'
            : 'Comece com uma conta segura de e-mail e senha.'}
        </p>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        {mode === 'register' && (
          <div className="space-y-1.5">
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Como podemos chamar você?"
              aria-invalid={Boolean(fieldErrors.name)}
              className="h-11 bg-white focus-visible:ring-[#57D067]"
            />
            {fieldErrors.name && <p className="text-xs text-red-600">{fieldErrors.name}</p>}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <div className="relative">
            <AppIcons.email
              className="absolute left-3 top-3.5 h-4 w-4 text-[#A3A5AF]"
              aria-hidden="true"
            />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="voce@empresa.com"
              aria-invalid={Boolean(fieldErrors.email)}
              className="h-11 bg-white pl-9 focus-visible:ring-[#57D067]"
            />
          </div>
          {fieldErrors.email && <p className="text-xs text-red-600">{fieldErrors.email}</p>}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Senha</Label>
            {mode === 'login' && (
              <Link
                to="/forgot-password"
                className="text-xs font-medium text-[#526174] hover:text-[#273044]"
              >
                Esqueci minha senha
              </Link>
            )}
          </div>
          <div className="relative">
            <AppIcons.lock
              className="absolute left-3 top-3.5 h-4 w-4 text-[#A3A5AF]"
              aria-hidden="true"
            />
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Sua senha"
              aria-invalid={Boolean(fieldErrors.password)}
              className="h-11 bg-white px-9 focus-visible:ring-[#57D067]"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute right-3 top-3 text-[#A3A5AF] transition-colors hover:text-[#464B5F]"
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {showPassword ? (
                <AppIcons.eyeOff className="h-4 w-4" />
              ) : (
                <AppIcons.modeReadOnly className="h-4 w-4" />
              )}
            </button>
          </div>
          {fieldErrors.password && <p className="text-xs text-red-600">{fieldErrors.password}</p>}
        </div>

        {mode === 'register' && (
          <div className="space-y-1.5">
            <Label htmlFor="passwordConfirm">Confirmar senha</Label>
            <Input
              id="passwordConfirm"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={passwordConfirm}
              onChange={(event) => setPasswordConfirm(event.target.value)}
              placeholder="Repita sua senha"
              aria-invalid={Boolean(fieldErrors.passwordConfirm)}
              className="h-11 bg-white focus-visible:ring-[#57D067]"
            />
            {fieldErrors.passwordConfirm && (
              <p className="text-xs text-red-600">{fieldErrors.passwordConfirm}</p>
            )}
          </div>
        )}

        {formMessage && (
          <div
            className={`rounded-lg border px-3 py-2.5 text-sm leading-5 ${verificationSent ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}
          >
            {formMessage}
          </div>
        )}

        <Button
          type="submit"
          disabled={loading}
          className="h-11 w-full bg-[#464B5F] font-semibold text-white hover:bg-[#363C50]"
        >
          {loading ? <AppIcons.spinner className="mr-2 h-4 w-4 animate-spin" /> : null}
          {mode === 'login' ? 'Entrar na inbox' : 'Criar conta'}
          {!loading && <AppIcons.arrowNavRight className="ml-2 h-4 w-4" />}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-[#73798A]">
        {mode === 'login' ? 'Ainda não tem conta?' : 'Já tem uma conta?'}{' '}
        <button
          type="button"
          onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
          className="font-semibold text-[#3E485D] underline decoration-[#64D8B1] decoration-2 underline-offset-4"
        >
          {mode === 'login' ? 'Criar conta' : 'Entrar'}
        </button>
      </p>
    </div>
  )
}
