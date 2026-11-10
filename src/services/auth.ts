import type { RecordModel } from 'pocketbase'
import pb from '@/lib/pocketbase/client'
import { extractFieldErrors } from '@/lib/pocketbase/errors'

export interface AuthUser extends RecordModel {
  email: string
  name?: string
  verified?: boolean
  risk_acknowledged?: boolean
}

export interface Credentials {
  email: string
  password: string
}

export interface Registration extends Credentials {
  name: string
  passwordConfirm: string
}

const messageTranslations: Array<[RegExp, string]> = [
  [/must be a valid email/i, 'Informe um e-mail válido.'],
  [/cannot be blank|required/i, 'Este campo é obrigatório.'],
  [/must be at least (\d+)/i, 'Use pelo menos $1 caracteres.'],
  [/values don't match|do not match/i, 'As senhas não coincidem.'],
  [/already exists|must be unique/i, 'Este e-mail já está cadastrado.'],
  [/failed to authenticate|invalid credentials/i, 'E-mail ou senha incorretos.'],
  [/token.*expired|expired.*token/i, 'Este link expirou. Solicite um novo.'],
]

function translateMessage(message: string): string {
  for (const [pattern, translation] of messageTranslations) {
    if (pattern.test(message))
      return message.replace(pattern, translation).replace(message, translation)
  }
  return message || 'Não foi possível concluir. Tente novamente.'
}

export function authErrorDetails(error: unknown): {
  fields: Record<string, string>
  message: string
} {
  const backendFields = extractFieldErrors(error)
  const fields = Object.fromEntries(
    Object.entries(backendFields).map(([field, message]) => [field, translateMessage(message)]),
  )

  const rawMessage = error instanceof Error ? error.message : ''
  const hasFields = Object.keys(fields).length > 0
  return {
    fields,
    message: hasFields ? '' : translateMessage(rawMessage),
  }
}

export async function signIn({ email, password }: Credentials): Promise<AuthUser> {
  const result = await pb.collection('users').authWithPassword(email.trim(), password)
  return result.record as AuthUser
}

export async function signUp(data: Registration): Promise<{ signedIn: boolean }> {
  await pb.collection('users').create({
    email: data.email.trim(),
    password: data.password,
    passwordConfirm: data.passwordConfirm,
    name: data.name.trim(),
    risk_acknowledged: false,
  })

  try {
    await pb.collection('users').requestVerification(data.email.trim())
  } catch {
    // A conta já existe mesmo se o provedor de e-mail estiver indisponível.
  }

  try {
    await signIn({ email: data.email, password: data.password })
    return { signedIn: true }
  } catch {
    return { signedIn: false }
  }
}

export async function requestPasswordRecovery(email: string): Promise<void> {
  await pb.collection('users').requestPasswordReset(email.trim())
}

export const requestPasswordReset = requestPasswordRecovery

export async function resetPassword(
  token: string,
  password: string,
  passwordConfirm: string,
): Promise<void> {
  await pb.collection('users').confirmPasswordReset(token, password, passwordConfirm)
}

export const confirmPasswordReset = resetPassword

export async function verifyEmail(token: string): Promise<void> {
  await pb.collection('users').confirmVerification(token)
}

export const confirmEmailVerification = verifyEmail

export async function requestEmailChange(email: string): Promise<void> {
  await pb.collection('users').requestEmailChange(email.trim())
}

export async function confirmEmailChange(token: string, password: string): Promise<void> {
  await pb.collection('users').confirmEmailChange(token, password)
  pb.authStore.clear()
}

export async function acknowledgeRisk(): Promise<void> {
  if (!pb.authStore.record) return
  const record = await pb.collection('users').update(pb.authStore.record.id, {
    risk_acknowledged: true,
  })
  pb.authStore.save(pb.authStore.token, record)
}
