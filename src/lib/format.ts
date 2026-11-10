export function hoursSince(value: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 3600000))
}

export function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000))
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours}h`
  return `há ${Math.floor(hours / 24)}d`
}

export function shortDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
    .format(new Date(value))
    .replace('.', '')
}

export function fullDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  )
}

export function formatListTime(value: string) {
  const date = new Date(value)
  const today = new Date()
  return date.toDateString() === today.toDateString()
    ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date)
    : new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(date)
}

export function isOverdue(value: string) {
  return new Date(value).getTime() < Date.now()
}

export function formatDeadline(value: string) {
  return shortDate(value)
}

export function shortElapsed(value: string) {
  const hours = hoursSince(value)
  return hours < 1 ? relativeTime(value).replace('há ', '') : `${hours}h`
}

export function respondedLabel(value: string) {
  return `Respondida ${relativeTime(value)}`
}

export function defaultFollowUpDate() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000)
  date.setMinutes(0, 0, 0)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

/**
 * Valida e formata o nome de exibição de um usuário ou conta,
 * garantindo que mensagens de erro, exceções ou strings corrompidas nunca apareçam na UI.
 */
export function sanitizeDisplayName(
  name?: string | null,
  email?: string | null,
  fallback = 'Minha conta',
): string {
  const raw = (name || '').trim()
  const isCorrupted =
    !raw ||
    raw.includes('FFB_ERR') ||
    raw.includes('$filesystem') ||
    raw.includes('is not defined') ||
    raw.includes('TypeError') ||
    raw.includes('ReferenceError') ||
    raw.includes('Error:') ||
    /^err(_|:)/i.test(raw)

  if (!isCorrupted) {
    return raw
  }

  // Tentar derivar um nome amigável a partir do e-mail
  if (email && email.includes('@')) {
    const handle = email.split('@')[0].trim()
    if (handle) {
      // Capitalizar primeira letra se for nome simples
      return handle.charAt(0).toUpperCase() + handle.slice(1)
    }
  }

  return fallback
}
