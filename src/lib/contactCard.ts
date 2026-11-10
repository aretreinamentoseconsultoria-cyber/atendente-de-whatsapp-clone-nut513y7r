/**
 * Utilitário de detecção e extração de contatos compartilhados (vCard / WhatsApp Contact Card).
 *
 * Fontes suportadas:
 * 1. Payload de texto com prefixo de contato: "👤 Nome do Contato" ou "\u{1F464} Nome"
 *    (padrão como a Zernio e o WhatsApp Webhook salvam quando a mensagem é do tipo contato compartilhado)
 * 2. Mensagens com conteúdo vCard puro (BEGIN:VCARD ... END:VCARD)
 * 3. JSON estruturado dentro de message.body ou payload: { type: 'contact', name, phone, email, org, ... }
 * 4. Padrões multilinha gerados por clientes WhatsApp para contatos compartilhados:
 *    "Contato: Nome\nTelefone: +55..." ou "👤 Nome\n+55..."
 */

export interface SharedContactData {
  isContact: boolean
  name: string
  phone?: string
  email?: string
  organization?: string
  rawBody: string
}

/**
 * Normaliza número de telefone para busca e matching:
 * - Apenas dígitos
 * - Normalização de prefixo Brasil (+55 / 55)
 * - Retorna o telefone limpo normalizado
 */
export function normalizePhoneForMatch(phone?: string | null): string {
  if (!phone) return ''
  let digits = phone.replace(/\D/g, '')
  if (!digits) return ''

  // Se começar com 0 nacional (ex: 011988887777), remover o 0 inicial
  if (digits.startsWith('0') && digits.length >= 11) {
    digits = digits.slice(1)
  }

  // Se tiver 10 ou 11 dígitos (DDD + 8 ou 9 dígitos), adicionar prefixo 55
  if (digits.length === 10 || digits.length === 11) {
    digits = '55' + digits
  }

  return digits
}

/**
 * Normaliza o nome para busca e matching:
 * - Converte para lowercase
 * - Remove acentos diacríticos
 * - Remove títulos honoríficos e sufixos comuns ("Dr.", "Dra.", "Med", "Dr", "Dra")
 * - Remove pontuações e colapsa espaços extras
 */
export function normalizeNameForMatch(name?: string | null): string {
  if (!name) return ''
  let cleaned = name.toLowerCase()

  // Normalizar acentos
  cleaned = cleaned.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  // Remover títulos e marcadores no início ou fim ou cercados por limites de palavra
  // Dr. / Dra. / Med / Dr / Dra
  cleaned = cleaned.replace(/\b(dr|dra|doutor|doutora|med)\b\.?/gi, ' ')

  // Remover caracteres não alfanuméricos exceto espaços
  cleaned = cleaned.replace(/[^\w\s]/gi, ' ')

  // Colapsar espaços
  return cleaned.replace(/\s+/g, ' ').trim()
}

/**
 * Analisa o corpo da mensagem e extrai os dados do contato compartilhado caso aplicável.
 */
export function parseSharedContact(body: string | undefined | null): SharedContactData | null {
  if (!body || typeof body !== 'string') return null
  const trimmed = body.trim()
  if (!trimmed) return null

  // 1. Detecção por JSON embutido (caso a mensagem guarde objeto serializado)
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (
        parsed &&
        (parsed.type === 'contact' ||
          parsed.type === 'vcard' ||
          parsed.vcard ||
          (parsed.name && (parsed.phone || parsed.phoneNumber)))
      ) {
        return {
          isContact: true,
          name:
            parsed.name || parsed.displayName || parsed.formattedName || 'Contato compartilhado',
          phone: parsed.phone || parsed.phoneNumber || parsed.tel || undefined,
          email: parsed.email || undefined,
          organization: parsed.organization || parsed.org || parsed.company || undefined,
          rawBody: body,
        }
      }
    } catch {
      // Segue para os próximos parsers caso não seja JSON válido
    }
  }

  // 2. Detecção por formato vCard RFC 6350 / WhatsApp vCard
  if (/BEGIN:VCARD/i.test(trimmed)) {
    const fnMatch = trimmed.match(/FN:(.+?)(?:\r?\n|$)/i)
    const telMatch = trimmed.match(/TEL(?:;[^:]+)?:(.+?)(?:\r?\n|$)/i)
    const emailMatch = trimmed.match(/EMAIL(?:;[^:]+)?:(.+?)(?:\r?\n|$)/i)
    const orgMatch = trimmed.match(/ORG(?:;[^:]+)?:(.+?)(?:\r?\n|$)/i)

    const name = fnMatch ? fnMatch[1].trim() : 'Contato compartilhado'
    const phone = telMatch ? telMatch[1].trim() : undefined
    const email = emailMatch ? emailMatch[1].trim() : undefined
    const organization = orgMatch ? orgMatch[1].trim().replace(/;/g, ' · ') : undefined

    return {
      isContact: true,
      name,
      phone,
      email,
      organization,
      rawBody: body,
    }
  }

  // 3. Detecção por emoji marcador de contato (👤 ou 👥) — formato real registrado no banco
  // Ex: "👤 Carlos Fernando MED"
  // Ex: "👤 Dr. Antonio Santana Queiroz"
  // Ex com quebra de linha: "👤 Carlos Fernando\n+55 11 99999-9999\nEmpresa XYZ"
  const emojiContactRegex = /^(?:👤|👥)\s*(.+)$/s
  const emojiMatch = trimmed.match(emojiContactRegex)
  if (emojiMatch) {
    const content = emojiMatch[1].trim()
    const lines = content
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)

    const name = lines[0] || 'Contato compartilhado'
    let phone: string | undefined
    let email: string | undefined
    let organization: string | undefined

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      // Detecção de telefone
      if (/(?:tel|telefone|fone|cel|celular|whatsapp|wa)?:?\s*(\+?[0-9\s().-]{8,22})/i.test(line)) {
        const pMatch = line.match(/(\+?[0-9\s().-]{8,22})/)
        if (pMatch && !phone) phone = pMatch[1].trim()
      } else if (/@/.test(line) && !email) {
        email = line.replace(/^(?:e-mail|email):?\s*/i, '').trim()
      } else if (!organization) {
        organization = line.replace(/^(?:empresa|org|cargo):?\s*/i, '').trim()
      }
    }

    return {
      isContact: true,
      name,
      phone,
      email,
      organization,
      rawBody: body,
    }
  }

  // 4. Detecção por texto explícito de contato compartilhado
  // Ex: "Contato: Carlos Fernando\n+55 11 98888-8888" ou "Cartão de contato: Carlos"
  const textPrefixRegex = /^(?:cart[ãa]o de contato|contato compartilhado|contato):\s*(.+)$/i
  const textPrefixMatch = trimmed.match(textPrefixRegex)
  if (textPrefixMatch) {
    const content = textPrefixMatch[1].trim()
    const lines = content
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
    const name = lines[0] || 'Contato'
    let phone: string | undefined
    let email: string | undefined

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      if (/(?:\+?[0-9\s().-]{8,22})/.test(line) && !phone) {
        phone = line.trim()
      } else if (/@/.test(line) && !email) {
        email = line.trim()
      }
    }

    return {
      isContact: true,
      name,
      phone,
      email,
      rawBody: body,
    }
  }

  return null
}
