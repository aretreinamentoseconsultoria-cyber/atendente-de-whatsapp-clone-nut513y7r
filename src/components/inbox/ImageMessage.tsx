import { useState } from 'react'
import { Image as ImageIcon, ExternalLink, AlertCircle, Loader2 } from 'lucide-react'
import pb from '@/lib/pocketbase/client'

export interface ImageMessageProps {
  messageId: string
  mediaUrl?: string
  caption?: string
  direction?: 'in' | 'out'
}

export function ImageMessage({
  messageId,
  mediaUrl,
  caption,
  direction = 'in',
}: ImageMessageProps) {
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)

  const hasMedia = Boolean(mediaUrl && mediaUrl.trim())
  const token = pb.authStore.token
  const baseUrl = pb.baseUrl || ''
  const proxySrc = hasMedia
    ? `${baseUrl}/backend/v1/zernio/media?messageId=${encodeURIComponent(
        messageId,
      )}${mediaUrl ? `&url=${encodeURIComponent(mediaUrl)}` : ''}${
        token ? `&token=${encodeURIComponent(token)}` : ''
      }`
    : ''

  const isGenericCaption =
    !caption || caption === '📷 Imagem' || caption === '📎 Anexo' || caption.trim() === ''

  return (
    <div className="flex flex-col gap-1.5 w-full max-w-[280px]">
      <div className="relative overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 aspect-video flex items-center justify-center">
        {hasMedia && !error ? (
          <>
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-100/80 dark:bg-slate-800/80">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            )}
            <img
              src={proxySrc}
              alt={isGenericCaption ? 'Imagem recebida' : caption}
              className={`h-full w-full object-cover transition-opacity duration-200 cursor-pointer ${
                loading ? 'opacity-0' : 'opacity-100'
              }`}
              onLoad={() => setLoading(false)}
              onError={() => {
                setLoading(false)
                setError(true)
              }}
              onClick={() => {
                if (proxySrc) {
                  window.open(proxySrc, '_blank', 'noopener,noreferrer')
                }
              }}
            />
            {!loading && (
              <a
                href={proxySrc}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute top-2 right-2 rounded-md bg-black/50 p-1 text-white hover:bg-black/70 transition-colors"
                title="Abrir imagem original"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center gap-1 text-slate-400 p-4 text-center">
            <ImageIcon className="h-6 w-6 text-slate-300" />
            <span className="text-[11px]">{error ? 'Imagem indisponível' : 'Sem mídia'}</span>
          </div>
        )}
      </div>

      {!isGenericCaption && caption && (
        <p className="whitespace-pre-wrap break-words text-xs">{caption}</p>
      )}

      {error && (
        <div className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span>Não foi possível carregar a imagem.</span>
        </div>
      )}
    </div>
  )
}
