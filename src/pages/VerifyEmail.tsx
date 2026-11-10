import { useEffect, useState } from 'react'
import { AppIcons } from '@/lib/icons'
import { Link, useSearchParams } from 'react-router-dom'

import AuthPageShell from '@/components/AuthPageShell'
import { confirmEmailVerification } from '@/services/auth'

type VerifyState = 'loading' | 'success' | 'error'

export default function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [state, setState] = useState<VerifyState>('loading')

  useEffect(() => {
    let active = true
    const verify = async () => {
      if (!token) {
        setState('error')
        return
      }
      try {
        await confirmEmailVerification(token)
        if (active) setState('success')
      } catch {
        if (active) setState('error')
      }
    }
    void verify()
    return () => {
      active = false
    }
  }, [token])

  return (
    <AuthPageShell
      eyebrow="VERIFICAÇÃO DE E-MAIL"
      title={
        state === 'success'
          ? 'E-mail confirmado'
          : state === 'error'
            ? 'Não foi possível confirmar'
            : 'Confirmando seu e-mail…'
      }
      description="Esta etapa mantém o acesso à sua conta protegido."
    >
      <div className={`verify-state ${state}`} role="status">
        {state === 'loading' && <span className="spinner" />}
        {state === 'success' && <AppIcons.checkCircle size={30} />}
        {state === 'error' && <AppIcons.warningCircle size={30} />}
        <p>
          {state === 'loading' && 'Só um instante enquanto validamos o link.'}
          {state === 'success' && 'Tudo certo. Você já pode acessar sua caixa de entrada.'}
          {state === 'error' &&
            'O link pode ter expirado ou já ter sido usado. Solicite um novo link, se necessário.'}
        </p>
      </div>
      {state !== 'loading' && (
        <Link className="primary-button full" to="/">
          Ir para o início
        </Link>
      )}
    </AuthPageShell>
  )
}
