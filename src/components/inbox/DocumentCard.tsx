import { useState } from 'react'
import { FileText, Download, ExternalLink, Loader2, AlertCircle } from 'lucide-react'
import pb from '@/lib/pocketbase/client'

export interface DocumentCardProps {
  messageId: string
  mediaUrl?: string
  fileName?: string
  direction?: 'in' | 'out'
}

export function DocumentCard({
  messageId,
  mediaUrl,
  fileName,
  direction = 'in',
}: DocumentCardProps) {
  const [downloading, setDownloading] = useState(false)
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isOut = direction === 'out'
  const hasMedia = Boolean(mediaUrl && mediaUrl.trim())

  // Monta a URL de proxy autenticada
  const token = pb.authStore.token
  const baseUrl = pb.baseUrl || ''
  const proxyUrl = hasMedia
    ? `${baseUrl}/backend/v1/zernio/media?messageId=${encodeURIComponent(
        messageId,
      )}${mediaUrl ? `&url=${encodeURIComponent(mediaUrl)}` : ''}${
        token ? `&token=${encodeURIComponent(token)}` : ''
      }`
    : ''

  // Limpa o nome do arquivo se for um fallback genérico
  const isGeneric =
    !fileName || fileName === '📎 Anexo' || fileName === '📄 Documento' || fileName.trim() === ''
  const displayName = isGeneric ? 'Documento' : fileName.trim()

  const isPdf =
    displayName.toLowerCase().endsWith('.pdf') ||
    (mediaUrl ? mediaUrl.toLowerCase().includes('.pdf') : false)

  const extension = displayName.includes('.')
    ? displayName.split('.').pop()?.toUpperCase()
    : isPdf
      ? 'PDF'
      : 'DOC'

  const fetchBlob = async (): Promise<{ blob: Blob; url: string } | null> => {
    if (!proxyUrl) {
      setError('Mídia não disponível para download.')
      return null
    }

    const headers: HeadersInit = {}
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const res = await fetch(proxyUrl, { headers })
    if (!res.ok) {
      let errJson: { message?: string } = {}
      try {
        errJson = await res.json()
      } catch {
        /* ignore */
      }
      if (res.status === 401) {
        setError('Sessão expirada. Recarregue a página.')
      } else if (res.status === 404 || res.status === 410) {
        setError('Documento indisponível ou expirado na Zernio.')
      } else {
        setError(errJson.message || `Falha ao carregar documento (${res.status}).`)
      }
      return null
    }

    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    return { blob, url: objectUrl }
  }

  const handleDownload = async () => {
    if (downloading) return
    setError(null)
    setDownloading(true)
    try {
      const result = await fetchBlob()
      if (!result) {
        setDownloading(false)
        return
      }

      const a = document.createElement('a')
      a.href = result.url
      a.download = isGeneric
        ? `documento-${messageId.slice(0, 6)}.${extension.toLowerCase()}`
        : displayName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(result.url), 5000)
    } catch (e: unknown) {
      console.warn('Erro ao baixar documento:', e)
      setError('Erro de conexão ao baixar arquivo.')
    } finally {
      setDownloading(false)
    }
  }

  const handleView = async () => {
    if (opening) return
    setError(null)
    setOpening(true)
    try {
      const result = await fetchBlob()
      if (!result) {
        setOpening(false)
        return
      }
      window.open(result.url, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(result.url), 60000)
    } catch (e: unknown) {
      console.warn('Erro ao visualizar documento:', e)
      setError('Erro de conexão ao abrir arquivo.')
    } finally {
      setOpening(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 py-0.5 w-full min-w-[220px] max-w-[320px]">
      <div className="flex items-center gap-3">
        {/* Ícone de documento / PDF */}
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform active:scale-95 ${
            isPdf
              ? 'bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400'
              : 'bg-emerald-600/10 text-emerald-700 dark:bg-emerald-600/20 dark:text-emerald-400'
          }`}
        >
          <FileText className="h-5 w-5" />
        </div>

        {/* Informações do arquivo */}
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <span
            className="truncate text-xs font-semibold text-[#2D3339] dark:text-slate-100"
            title={displayName}
          >
            {displayName}
          </span>
          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[#717A84] dark:text-slate-400 font-medium">
            <span className="rounded bg-slate-200/80 dark:bg-slate-700/60 px-1 py-0.2 font-mono text-[9px] uppercase tracking-wide">
              {extension}
            </span>
            <span>Documento</span>
          </div>
        </div>
      </div>

      {/* Ações: Baixar e Visualizar */}
      <div className="flex items-center gap-2 pt-1 border-t border-slate-200/60 dark:border-slate-700/50">
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading || opening || !hasMedia}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
            isOut
              ? 'bg-[#3D6B56] hover:bg-[#2F5343] text-white disabled:bg-[#A8C7B9]'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white disabled:bg-slate-200 disabled:text-slate-400'
          }`}
          title="Baixar arquivo no computador"
        >
          {downloading ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Baixando…</span>
            </>
          ) : (
            <>
              <Download className="h-3 w-3" />
              <span>Baixar</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleView}
          disabled={downloading || opening || !hasMedia}
          className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300/80 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
          title="Visualizar em nova aba"
        >
          {opening ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <>
              <ExternalLink className="h-3 w-3" />
              <span>Abrir</span>
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span className="line-clamp-1">{error}</span>
        </div>
      )}
    </div>
  )
}
