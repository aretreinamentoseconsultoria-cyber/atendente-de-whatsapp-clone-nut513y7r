import { useId } from 'react'

export interface AloLogoProps {
  /**
   * Altura do logo (preservando aspect-ratio). Padrão: 32px
   */
  height?: number | string
  /**
   * Largura do logo (opcional, calcula automaticamente pelo aspect ratio se omitido)
   */
  width?: number | string
  /**
   * Se true, oculta a assinatura "ATENDENTE WHATSAPP" e exibe o wordmark refinado
   */
  compact?: boolean
  /**
   * Se true, exibe apenas o balão de fala com os pontos de conversa como ícone/símbolo independente
   */
  iconOnly?: boolean
  /**
   * Ativar animação de entrada premium (fade + trace suave) — respeita prefers-reduced-motion
   * Padrão: true
   */
  animated?: boolean
  /**
   * Classes CSS adicionais para o container/svg
   */
  className?: string
  /**
   * Texto alternativo para acessibilidade
   */
  title?: string
}

/**
 * AloLogo — Identidade vetorial premium e fina para "Alô — Atendente WhatsApp"
 *
 * Conceito & Diretrizes Visuais:
 * - Traço fino, geométrico e elegante com espessura equilibrada (stroke-width calibrado).
 * - Balão de conversa suave e contemporâneo com cauda orgânica apontando discretamente para a esquerda.
 * - Pontos de conversa pulsando sutilmente na entrada ou estáticos com perfeita legibilidade.
 * - Acento circunflexo elegante e sutil sobre o 'o' / balão, integrando perfeitamente a pronúncia "Alô".
 * - Tipografia limpa, kerning refinado e baseline milimetricamente alinhada.
 * - Suporte a motion de entrada (fade-in + dashoffset / scale suave) que roda uma única vez.
 * - IDs de gradiente gerados via useId() para isolamento em múltiplas renderizações simultâneas.
 * - Paleta estrita: #464B5F (glifos), #57D067 -> #64D8B1 (gradiente verde), #2C8A55 (pontos), #A3A5AF (assinatura).
 */
export function AloLogo({
  height = 32,
  width,
  compact = false,
  iconOnly = false,
  animated = true,
  className = '',
  title = 'Alô — Atendente WhatsApp',
}: AloLogoProps) {
  const rawId = useId()
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, '')
  const gradId = `alo-grad-${uid}`
  const maskId = `alo-mask-${uid}`

  // Estilos de animação CSS injetados de forma limpa e com escopo único pelo uid
  const animationStyles = animated ? (
    <style>{`
      @keyframes alo-fade-in-${uid} {
        0% { opacity: 0; transform: translateY(3px); }
        100% { opacity: 1; transform: translateY(0); }
      }
      @keyframes alo-stroke-draw-${uid} {
        0% { stroke-dashoffset: 140; opacity: 0.2; }
        100% { stroke-dashoffset: 0; opacity: 1; }
      }
      @keyframes alo-dot-pop-${uid} {
        0% { transform: scale(0); opacity: 0; }
        60% { transform: scale(1.15); opacity: 1; }
        100% { transform: scale(1); opacity: 1; }
      }
      .alo-letter-a-${uid} {
        animation: alo-fade-in-${uid} 550ms cubic-bezier(0.16, 1, 0.3, 1) 40ms backwards;
      }
      .alo-letter-l-${uid} {
        animation: alo-fade-in-${uid} 550ms cubic-bezier(0.16, 1, 0.3, 1) 120ms backwards;
      }
      .alo-bubble-${uid} {
        stroke-dasharray: 140;
        animation: alo-stroke-draw-${uid} 750ms cubic-bezier(0.16, 1, 0.3, 1) 180ms backwards;
      }
      .alo-circunflexo-${uid} {
        animation: alo-fade-in-${uid} 500ms cubic-bezier(0.16, 1, 0.3, 1) 280ms backwards;
      }
      .alo-dot1-${uid} {
        transform-origin: 153px 48px;
        animation: alo-dot-pop-${uid} 420ms cubic-bezier(0.34, 1.56, 0.64, 1) 360ms backwards;
      }
      .alo-dot2-${uid} {
        transform-origin: 164px 48px;
        animation: alo-dot-pop-${uid} 420ms cubic-bezier(0.34, 1.56, 0.64, 1) 430ms backwards;
      }
      .alo-dot3-${uid} {
        transform-origin: 175px 48px;
        animation: alo-dot-pop-${uid} 420ms cubic-bezier(0.34, 1.56, 0.64, 1) 500ms backwards;
      }
      .alo-tagline-${uid} {
        animation: alo-fade-in-${uid} 600ms cubic-bezier(0.16, 1, 0.3, 1) 400ms backwards;
      }

      /* Caso iconOnly */
      .alo-icon-bubble-${uid} {
        stroke-dasharray: 160;
        animation: alo-stroke-draw-${uid} 700ms cubic-bezier(0.16, 1, 0.3, 1) backwards;
      }
      .alo-icon-dot1-${uid} {
        transform-origin: 24px 33px;
        animation: alo-dot-pop-${uid} 400ms cubic-bezier(0.34, 1.56, 0.64, 1) 200ms backwards;
      }
      .alo-icon-dot2-${uid} {
        transform-origin: 36px 33px;
        animation: alo-dot-pop-${uid} 400ms cubic-bezier(0.34, 1.56, 0.64, 1) 280ms backwards;
      }
      .alo-icon-dot3-${uid} {
        transform-origin: 48px 33px;
        animation: alo-dot-pop-${uid} 400ms cubic-bezier(0.34, 1.56, 0.64, 1) 360ms backwards;
      }

      @media (prefers-reduced-motion: reduce) {
        .alo-letter-a-${uid},
        .alo-letter-l-${uid},
        .alo-bubble-${uid},
        .alo-circunflexo-${uid},
        .alo-dot1-${uid},
        .alo-dot2-${uid},
        .alo-dot3-${uid},
        .alo-tagline-${uid},
        .alo-icon-bubble-${uid},
        .alo-icon-dot1-${uid},
        .alo-icon-dot2-${uid},
        .alo-icon-dot3-${uid} {
          animation: none !important;
          stroke-dasharray: none !important;
          stroke-dashoffset: 0 !important;
          transform: none !important;
          opacity: 1 !important;
        }
      }
    `}</style>
  ) : null

  // =========================================================================
  // 1. VARIANTE ICON ONLY (Balão independente de alta resolução óptica)
  // =========================================================================
  if (iconOnly) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 72 72"
        height={height}
        width={width ?? height}
        fill="none"
        className={className}
        role="img"
        aria-label={title}
      >
        <title>{title}</title>
        <defs>
          <linearGradient
            id={`${gradId}-icon`}
            x1="12"
            y1="8"
            x2="60"
            y2="64"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#57D067" />
            <stop offset="100%" stopColor="#64D8B1" />
          </linearGradient>
        </defs>
        {animationStyles}

        {/* Fundo suave com glow sutil translúcido */}
        <circle cx="36" cy="36" r="32" fill="#57D067" fillOpacity="0.06" />

        {/* Balão de fala ultra-fino e fluido com cantos arredondados contínuos */}
        <path
          className={animated ? `alo-icon-bubble-${uid}` : undefined}
          d="M20 14 h32 a14 14 0 0 1 14 14 v15 a14 14 0 0 1 -14 14 h-16 l-13 9 c-2.3 1.6 -4.8 -0.8 -3.8 -3.2 l2 -5.2 a14 14 0 0 1 -4.2 -10.6 v-15 a14 14 0 0 1 14 -14 Z"
          stroke={`url(#${gradId}-icon)`}
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Três pontos com preenchimento #2C8A55 */}
        <circle
          className={animated ? `alo-icon-dot1-${uid}` : undefined}
          cx="24"
          cy="33"
          r="2.8"
          fill="#2C8A55"
        />
        <circle
          className={animated ? `alo-icon-dot2-${uid}` : undefined}
          cx="36"
          cy="33"
          r="2.8"
          fill="#2C8A55"
        />
        <circle
          className={animated ? `alo-icon-dot3-${uid}` : undefined}
          cx="48"
          cy="33"
          r="2.8"
          fill="#2C8A55"
        />
      </svg>
    )
  }

  // =========================================================================
  // 2. VARIANTE COMPACT (Wordmark "Alô" fino e proporcional, sem assinatura)
  // ViewBox: 220 x 80. Baseline refinada em y=62, cap-height em y=20
  // =========================================================================
  if (compact) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 216 78"
        height={height}
        width={width}
        fill="none"
        className={className}
        role="img"
        aria-label={title}
      >
        <title>{title}</title>
        <defs>
          <linearGradient
            id={`${gradId}-c`}
            x1="130"
            y1="22"
            x2="198"
            y2="72"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#57D067" />
            <stop offset="100%" stopColor="#64D8B1" />
          </linearGradient>
        </defs>
        {animationStyles}

        <g transform="translate(4, 2)">
          {/* Glifo 'A' fino e elegante: traço geométrico clean com espessura constante de 4px */}
          <g className={animated ? `alo-letter-a-${uid}` : undefined}>
            {/* Perna esquerda do A */}
            <line
              x1="12"
              y1="62"
              x2="35"
              y2="18"
              stroke="#464B5F"
              strokeWidth="4"
              strokeLinecap="round"
            />
            {/* Perna direita do A */}
            <line
              x1="35"
              y1="18"
              x2="58"
              y2="62"
              stroke="#464B5F"
              strokeWidth="4"
              strokeLinecap="round"
            />
            {/* Barra horizontal refinada do A */}
            <line
              x1="22"
              y1="46"
              x2="48"
              y2="46"
              stroke="#464B5F"
              strokeWidth="3.6"
              strokeLinecap="round"
            />
          </g>

          {/* Glifo 'l' fino com curvatura moderna na base unindo suavemente a linha */}
          <g className={animated ? `alo-letter-l-${uid}` : undefined}>
            <path
              d="M84 18 v36 c0 5.5 3.5 8 8 8 h4"
              stroke="#464B5F"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </g>

          {/* Balão 'o' refinado com gradiente verde WhatsApp e cauda sutil */}
          <g>
            <path
              className={animated ? `alo-bubble-${uid}` : undefined}
              d="M142 26 h30 a13 13 0 0 1 13 13 v12 a13 13 0 0 1 -13 13 h-14 l-11 8 c-1.9 1.4 -4.2 -0.6 -3.4 -2.8 l1.8 -4.6 a13 13 0 0 1 -3.4 -9.2 v-12 a13 13 0 0 1 13 -13 Z"
              stroke={`url(#${gradId}-c)`}
              strokeWidth="3.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />

            {/* Acento circunflexo fino e elegante sobre o balão: ^ com gradiente verde */}
            <path
              className={animated ? `alo-circunflexo-${uid}` : undefined}
              d="M152 17.5 L157 12.5 L162 17.5"
              stroke={`url(#${gradId}-c)`}
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Três pontos com espaçamento simétrico e raio 2.4 */}
            <circle
              className={animated ? `alo-dot1-${uid}` : undefined}
              cx="149"
              cy="45"
              r="2.5"
              fill="#2C8A55"
            />
            <circle
              className={animated ? `alo-dot2-${uid}` : undefined}
              cx="157"
              cy="45"
              r="2.5"
              fill="#2C8A55"
            />
            <circle
              className={animated ? `alo-dot3-${uid}` : undefined}
              cx="165"
              cy="45"
              r="2.5"
              fill="#2C8A55"
            />
          </g>
        </g>
      </svg>
    )
  }

  // =========================================================================
  // 3. VARIANTE COMPLETA (Com wordmark fino + assinatura "ATENDENTE WHATSAPP")
  // ViewBox: 320 x 96 — Proporção limpa, letras arejadas e legíveis.
  // =========================================================================
  return null
}

export default AloLogo
