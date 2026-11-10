import { cn } from '@/lib/utils'
import { AloLogo } from '@/components/AloLogo'

type BrandProps = {
  compact?: boolean
  className?: string
}

export default function Brand({ compact = false, className }: BrandProps) {
  return (
    <div className={cn('flex items-center', className)} aria-label="Alô — Atendente WhatsApp">
      <AloLogo height={compact ? 26 : 38} compact={compact} />
    </div>
  )
}
