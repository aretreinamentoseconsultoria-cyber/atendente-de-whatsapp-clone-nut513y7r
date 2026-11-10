import React, { useState } from 'react'
import { AppIcons } from '@/lib/icons'
import { avatarColors, initials } from '@/components/inbox/avatar'
import type { SharedContactData } from '@/lib/contactCard'
import { toast } from 'sonner'

export interface SharedContactCardProps {
  contact: SharedContactData
  isOutgoing?: boolean
  sentAt?: string
  formattedTime?: string
  /**
   * Se fornecido, aciona a busca ou seleção direta da conversa correspondente.
   */
  onOpenConversation?: (contactName: string, phone?: string) => void
}

/**
 * SharedContactCard
 *
 * Card visual inspirado na experiência nativa de Cartão de Contato do WhatsApp Web / Mobile:
 * - Avatar circular com as iniciais do contato e paleta sutil harmonizada
 * - Cabeçalho com ícone Phosphor AppIcons.contactCard em destaque (sem emoji de texto simples)
 * - Nome do contato compartilhado com peso tipográfico
 * - Subtítulos opcionais (empresa / especialidade, telefone formatado, e-mail)
 * - Rodapé com ações reais:
 *    • "Conversar" / "Buscar": localiza conversa na Inbox ou abre chat
 *    • "Copiar telefone" / "Copiar nome": copia com feedback visual imediato e toast
 * - Superfície translúcida/glass integrada ao design system (#EAF7F1 para outgoing, branco/vidro para incoming)
 * - Suporte a prefers-reduced-motion e acessibilidade
 */
export function SharedContactCard({
  contact,
  isOutgoing = false,
  formattedTime,
  onOpenConversation,
}: SharedContactCardProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const displayName = contact.name.trim() || 'Contato'
  const contactInitials = initials(displayName)
  const colors = avatarColors(displayName)

  const handleCopy = async (textToCopy: string, label: string, key: string) => {
    try {
      await navigator.clipboard.writeText(textToCopy)
      setCopiedKey(key)
      toast.success(`${label} copiado!`)
      setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev))
      }, 2000)
    } catch {
      toast.error(`Não foi possível copiar o ${label.toLowerCase()}.`)
    }
  }

  const handleMessageClick = () => {
    if (onOpenConversation) {
      onOpenConversation(displayName, contact.phone)
      return
    }

    if (contact.phone) {
      // Abre link do WhatsApp web se houver telefone
      const cleanPhone = contact.phone.replace(/[^0-9]/g, '')
      if (cleanPhone) {
        window.open(`https://wa.me/${cleanPhone}`, '_blank', 'noopener,noreferrer')
        return
      }
    }

    // Fallback: copia o nome do contato para a área de transferência
    void handleCopy(displayName, 'Nome do contato', 'name')
  }

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border transition-all duration-150 motion-reduce:transition-none shadow-xs w-full max-w-[340px] sm:max-w-[360px] ${
        isOutgoing
          ? 'border-[#B8D9CC] bg-white/90 backdrop-blur-sm text-[#274035]'
          : 'border-[#CBD6D7] bg-white/95 backdrop-blur-sm text-[#353B47]'
      }`}
    >
      {/* Topo informativo do cartão com ícone temático WhatsApp */}
      <div
        className={`flex items-center justify-between border-b px-3.5 py-2 text-[10px] font-semibold uppercase tracking-wider ${
          isOutgoing
            ? 'border-[#CCE3D8] bg-[#E3F4EC] text-[#2F6B4F]'
            : 'border-[#E2E8E8] bg-[#F4F8F8] text-[#55636C]'
        }`}
      >
        <div className="flex items-center gap-1.5">
          <AppIcons.contactCard className="h-3.5 w-3.5 text-[#2C8A55]" />
          <span>Cartão de Contato</span>
        </div>
        <span className="text-[9px] font-normal lowercase tracking-normal text-[#7E8B92]">
          WhatsApp
        </span>
      </div>

      {/* Conteúdo principal: Avatar circular + Informações */}
      <div className="flex items-center gap-3.5 p-3.5">
        <div
          className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full font-bold text-sm shadow-2xs ring-2 ring-white/80 select-none"
          style={{ backgroundColor: colors.backgroundColor, color: colors.color }}
          aria-hidden="true"
        >
          {contactInitials}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h4
              className="truncate text-xs font-bold text-[#1E293B] sm:text-sm"
              title={displayName}
            >
              {displayName}
            </h4>
          </div>

          {contact.organization && (
            <p
              className="truncate text-[11px] font-medium text-[#5B6B79]"
              title={contact.organization}
            >
              {contact.organization}
            </p>
          )}

          {contact.phone && (
            <p className="mt-0.5 truncate text-[11px] font-mono text-[#606E7B]">{contact.phone}</p>
          )}

          {contact.email && (
            <p className="truncate text-[10px] text-[#717F8D]" title={contact.email}>
              {contact.email}
            </p>
          )}

          {!contact.organization && !contact.phone && !contact.email && (
            <p className="text-[10px] text-[#818E9B]">Contato recebido via WhatsApp</p>
          )}
        </div>
      </div>

      {/* Barra de Ações nativas no estilo WhatsApp */}
      <div
        className={`grid grid-cols-2 divide-x border-t text-xs font-semibold ${
          isOutgoing
            ? 'divide-[#D7E8DF] border-[#D7E8DF] bg-[#F1F9F5]'
            : 'divide-[#E5ECEC] border-[#E5ECEC] bg-[#F9FBFA]'
        }`}
      >
        {/* Ação 1: Mensagem / Abrir na Inbox */}
        <button
          type="button"
          onClick={handleMessageClick}
          className="flex h-9 items-center justify-center gap-1.5 px-3 py-1.5 text-[#2C8A55] transition-colors hover:bg-black/5 active:scale-[0.99] motion-reduce:active:scale-100"
          title={`Buscar ou enviar mensagem para ${displayName}`}
        >
          <AppIcons.chatBubble className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate text-[11px]">Conversar</span>
        </button>

        {/* Ação 2: Copiar telefone ou copiar nome */}
        {contact.phone ? (
          <button
            type="button"
            onClick={() => handleCopy(contact.phone!, 'Telefone', 'phone')}
            className="flex h-9 items-center justify-center gap-1.5 px-3 py-1.5 text-[#464B5F] transition-colors hover:bg-black/5 active:scale-[0.99] motion-reduce:active:scale-100"
            title="Copiar número de telefone"
          >
            {copiedKey === 'phone' ? (
              <>
                <AppIcons.check className="h-3.5 w-3.5 shrink-0 text-[#2C8A55]" />
                <span className="text-[11px] font-bold text-[#2C8A55]">Copiado!</span>
              </>
            ) : (
              <>
                <AppIcons.copy className="h-3.5 w-3.5 shrink-0 text-[#67737F]" />
                <span className="truncate text-[11px]">Copiar fone</span>
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => handleCopy(displayName, 'Nome', 'name')}
            className="flex h-9 items-center justify-center gap-1.5 px-3 py-1.5 text-[#464B5F] transition-colors hover:bg-black/5 active:scale-[0.99] motion-reduce:active:scale-100"
            title="Copiar nome do contato"
          >
            {copiedKey === 'name' ? (
              <>
                <AppIcons.check className="h-3.5 w-3.5 shrink-0 text-[#2C8A55]" />
                <span className="text-[11px] font-bold text-[#2C8A55]">Copiado!</span>
              </>
            ) : (
              <>
                <AppIcons.copy className="h-3.5 w-3.5 shrink-0 text-[#67737F]" />
                <span className="truncate text-[11px]">Copiar nome</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Horário da mensagem */}
      {formattedTime && (
        <div className="px-3 py-1 text-right text-[9px] text-[#9098A1]">{formattedTime}</div>
      )}
    </div>
  )
}
export default SharedContactCard
