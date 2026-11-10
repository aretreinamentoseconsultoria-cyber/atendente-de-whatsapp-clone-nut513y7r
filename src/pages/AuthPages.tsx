import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AloLogo } from '@/components/AloLogo'
import { AppIcons } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import pb from '@/lib/pocketbase/client'

function Shell({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-b from-[#E7F8FF] to-[#D6F1FC] px-4">
      <Card className="w-full max-w-md border-[#CBD6D7]">
        <CardHeader>
          <div className="mb-3 flex items-center">
            <AloLogo height={38} />
          </div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          {children}
          <Link
            to="/"
            className="mt-5 flex items-center justify-center gap-1 text-xs text-[#667080]"
          >
            <AppIcons.arrowLeft className="h-3.5 w-3.5" /> Voltar à página inicial
          </Link>
        </CardContent>
      </Card>
    </main>
  )
}

export function ForgotPassword() {
  const [sent, setSent] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    await pb.collection('users').requestPasswordReset(String(data.get('email')))
    setSent(true)
  }
  return (
    <Shell
      title="Recuperar acesso"
      description="Enviaremos um link seguro para criar uma nova senha."
    >
      {sent ? (
        <div className="rounded-lg bg-[#EEF7F2] p-4 text-sm text-[#416554]">
          Link solicitado. Confira seu e-mail e também a pasta de spam.
        </div>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <div>
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" name="email" type="email" required className="mt-1.5" />
          </div>
          <Button className="w-full bg-[#464B5F]">Enviar link de recuperação</Button>
        </form>
      )}
    </Shell>
  )
}

export function ResetPassword() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const password = String(data.get('password'))
    const confirm = String(data.get('confirm'))
    if (password !== confirm) return setError('As senhas precisam ser iguais.')
    try {
      await pb
        .collection('users')
        .confirmPasswordReset(params.get('token') || '', password, confirm)
      navigate('/')
    } catch {
      setError('Este link expirou ou não é válido.')
    }
  }
  return (
    <Shell title="Criar nova senha" description="Escolha uma senha com pelo menos 8 caracteres.">
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <div>
          <Label>Nova senha</Label>
          <Input name="password" type="password" minLength={8} required className="mt-1.5" />
        </div>
        <div>
          <Label>Confirmar senha</Label>
          <Input name="confirm" type="password" minLength={8} required className="mt-1.5" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button className="w-full bg-[#464B5F]">Salvar nova senha</Button>
      </form>
    </Shell>
  )
}
