import React from 'react'

export const ZERNIO_REFERRAL_URL = 'https://zernio.link/fabiano-fabricio'
export const ZERNIO_LOGO_URL =
  'https://dubassets.com/programs/prog_1KQS5PPESGEBW3S5NVNBG1TDQ/logos/logo-primary-svg-8n62.svg'

export interface ZernioLogoProps {
  /** Altura da imagem do logo em pixels (padrão: 16) */
  height?: number
  /** Classes CSS adicionais para a imagem */
  className?: string
  /** Se true, renderiza apenas a imagem sem wrapper de link */
  raw?: boolean
}

/**
 * Renderiza o logo oficial da Zernio (SVG).
 * Por padrão, clica e abre o link de direcionamento do usuário em nova aba.
 */
export function ZernioLogo({ height = 16, className = '', raw = false }: ZernioLogoProps) {
  const img = (
    <img
      src={ZERNIO_LOGO_URL}
      alt="Zernio"
      height={height}
      style={{ height: `${height}px`, width: 'auto' }}
      className={`inline-block shrink-0 object-contain ${className}`}
      loading="lazy"
    />
  )

  if (raw) return img

  return (
    <a
      href={ZERNIO_REFERRAL_URL}
      target="_blank"
      rel="noopener noreferrer"
      title="Zernio — Integração oficial com Meta WhatsApp Cloud API"
      aria-label="Abrir Zernio em nova aba"
      className="inline-flex items-center transition-opacity hover:opacity-85 focus:outline-none focus:ring-1 focus:ring-[#2C8A55] rounded"
    >
      {img}
    </a>
  )
}

export interface ZernioBadgeProps {
  /** Variante visual do badge */
  variant?: 'subtle' | 'card' | 'pill' | 'button'
  /** Texto customizado (padrão varia por variante) */
  label?: string
  /** Classes CSS adicionais */
  className?: string
  /** Tamanho do logo */
  logoHeight?: number
}

/**
 * Badge/atribuição elegante com logo oficial da Zernio + link de direcionamento.
 */
export function ZernioBadge({
  variant = 'subtle',
  label,
  className = '',
  logoHeight = 16,
}: ZernioBadgeProps) {
  if (variant === 'pill') {
    return null
  }

  if (variant === 'card') {
    return (
      <div
        className={`rounded-xl border border-[#CBD6D7] bg-[#FBFBFB] p-4 text-xs transition-colors hover:border-[#2C8A55]/40 hover:bg-white ${className}`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#CBD6D7] bg-white p-1.5 shadow-2xs">
              <ZernioLogo height={20} raw />
            </div>
            <div>
              <p className="font-semibold text-[#353B47]">
                {label || 'Conexão oficial Meta Cloud API via Zernio'}
              </p>
              <p className="mt-0.5 text-[11px] text-[#7A838D]">
                Infraestrutura oficial da Meta com suporte multi-número e entrega garantida.
              </p>
            </div>
          </div>
          <a
            href={ZERNIO_REFERRAL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[#CBD6D7] bg-white px-3 py-1.5 text-xs font-medium text-[#464B5F] shadow-2xs transition-colors hover:border-[#2C8A55] hover:bg-[#F4F7F7] hover:text-[#2C8A55]"
          >
            Conhecer Zernio
            <span className="text-[11px]">↗</span>
          </a>
        </div>
      </div>
    )
  }

  if (variant === 'button') {
    return (
      <a
        href={ZERNIO_REFERRAL_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center gap-2 rounded-lg border border-[#CBD6D7] bg-white px-3 py-1.5 text-xs font-medium text-[#464B5F] shadow-2xs transition-all hover:border-[#2C8A55] hover:bg-[#F4F7F7] hover:text-[#2C8A55] ${className}`}
      >
        <span className="text-[11px] text-[#7A838D]">Acessar</span>
        <ZernioLogo height={logoHeight} raw className="translate-y-[0.5px]" />
        <span className="text-[10px] text-[#A3A5AF]">↗</span>
      </a>
    )
  }

  // Default: subtle inline
  return (
    <a
      href={ZERNIO_REFERRAL_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`group inline-flex items-center gap-1.5 text-xs text-[#7A808F] transition-colors hover:text-[#2C8A55] ${className}`}
    >
      <span>{label || 'API oficial da Meta via'}</span>
      <span className="inline-flex items-center rounded bg-black/5 px-1.5 py-0.5 transition-colors group-hover:bg-[#2C8A55]/10">
        <ZernioLogo height={logoHeight} raw className="translate-y-[0.5px]" />
      </span>
      <span className="text-[10px] text-[#A3A5AF] transition-transform group-hover:translate-x-0.5 group-hover:text-[#2C8A55]">
        ↗
      </span>
    </a>
  )
}
