import { useState, useRef, useEffect } from 'react'
import { Play, Pause, Volume2, AlertCircle, Loader2 } from 'lucide-react'
import pb from '@/lib/pocketbase/client'

export interface AudioPlayerProps {
  mediaUrl?: string
  messageId: string
  transcription?: string
  direction?: 'in' | 'out'
  durationLabel?: string
}

export function AudioPlayer({
  mediaUrl,
  messageId,
  transcription,
  direction = 'in',
  durationLabel,
}: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Monta URL autenticada de streaming através do proxy backend somente se houver mediaUrl ou messageId válido
  const hasMediaSource = Boolean(mediaUrl && mediaUrl.trim())
  const token = pb.authStore.token
  const baseUrl = pb.baseUrl || ''
  const proxySrc = hasMediaSource
    ? `${baseUrl}/backend/v1/zernio/media?messageId=${encodeURIComponent(
        messageId,
      )}${mediaUrl ? `&url=${encodeURIComponent(mediaUrl)}` : ''}${
        token ? `&token=${encodeURIComponent(token)}` : ''
      }`
    : ''

  // Efetua fetch explícito com token para diagnosticar a resposta exata do backend
  const fetchAudioBlob = async (): Promise<string | null> => {
    if (!proxySrc) {
      setError('Mídia não disponível para este áudio.')
      return null
    }
    try {
      const headers: HeadersInit = {}
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
      const res = await fetch(proxySrc, { headers })
      if (!res.ok) {
        let errJson: { code?: string; message?: string } = {}
        try {
          errJson = await res.json()
        } catch {
          /* intentionally ignored */
        }

        if (res.status === 401) {
          setError('Sessão expirada. Recarregue a página ou faça login.')
        } else if (res.status === 400 && errJson.code === 'MISSING_API_KEY') {
          setError('Configure sua chave Zernio nas configurações.')
        } else if (res.status === 404 || res.status === 410) {
          setError('Áudio expirado ou indisponível na Zernio.')
        } else if (errJson.message) {
          setError(errJson.message)
        } else {
          setError(`Falha ao obter áudio (HTTP ${res.status}).`)
        }
        return null
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      setBlobUrl(url)
      return url
    } catch (netErr: unknown) {
      console.warn('Falha de rede ao buscar áudio:', netErr)
      setError('Falha de conexão ao carregar áudio.')
      return null
    }
  }

  const isOutgoing = direction === 'out'

  const togglePlay = async () => {
    if (!audioRef.current) return

    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
      return
    }

    setError(null)
    setIsLoading(true)

    // Se ainda não temos blobUrl e o src nativo falhou anteriormente ou precisa de fallback
    let targetAudioEl = audioRef.current
    if (!targetAudioEl.src || targetAudioEl.src.startsWith('about:blank')) {
      const newUrl = await fetchAudioBlob()
      if (!newUrl) {
        setIsLoading(false)
        return
      }
      targetAudioEl.src = newUrl
    }

    targetAudioEl
      .play()
      .then(() => {
        setIsPlaying(true)
        setIsLoading(false)
      })
      .catch(async (err) => {
        console.warn('Falha ao reproduzir áudio via stream nativo:', err)
        // Fallback: tentar carregar via fetch Blob se ainda não tentou
        if (!blobUrl) {
          const freshBlobUrl = await fetchAudioBlob()
          if (freshBlobUrl && audioRef.current) {
            audioRef.current.src = freshBlobUrl
            audioRef.current
              .play()
              .then(() => {
                setIsPlaying(true)
                setIsLoading(false)
                setError(null)
              })
              .catch((playErr) => {
                setIsPlaying(false)
                setIsLoading(false)
                setError(
                  playErr.name === 'NotAllowedError'
                    ? 'Reprodução bloqueada pelo navegador (clique para ouvir).'
                    : 'Formato de áudio não reproduzível neste navegador.',
                )
              })
            return
          }
        }

        setIsPlaying(false)
        setIsLoading(false)
        if (!error) {
          setError(
            err.name === 'NotSupportedError' || err.name === 'NotAllowedError'
              ? 'Formato de áudio não suportado ou bloqueado pelo navegador.'
              : 'Não foi possível reproduzir o áudio.',
          )
        }
      })
  }

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime)
    }
  }

  const handleDurationChange = () => {
    if (audioRef.current) {
      const d = audioRef.current.duration
      if (Number.isFinite(d) && d > 0) {
        setDuration(d)
      }
    }
  }

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      const d = audioRef.current.duration
      if (Number.isFinite(d) && d > 0) {
        setDuration(d)
      }
      setIsLoading(false)
    }
  }

  const handleEnded = () => {
    setIsPlaying(false)
    setCurrentTime(0)
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value)
    if (audioRef.current && Number.isFinite(val)) {
      audioRef.current.currentTime = val
      setCurrentTime(val)
    }
  }

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
      }
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl)
      }
    }
  }, [blobUrl])

  const formatSeconds = (sec: number) => {
    if (!Number.isFinite(sec) || sec <= 0) return '0:00'
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  const isValidDuration = Number.isFinite(duration) && duration > 0
  const validCurrentTime = Number.isFinite(currentTime) && currentTime >= 0 ? currentTime : 0
  const progressPercent = isValidDuration
    ? Math.min(100, Math.max(0, (validCurrentTime / duration) * 100))
    : 0

  // Se durationLabel contiver "Infinity" ou "NaN" vindo de dados corrompidos anteriores, descarta
  const cleanDurationLabel =
    durationLabel && !/infinity|nan/i.test(durationLabel) ? durationLabel : undefined

  return (
    <div className="flex flex-col gap-1.5 py-0.5 w-full min-w-[210px] max-w-[290px]">
      <audio
        ref={audioRef}
        src={blobUrl || proxySrc || undefined}
        preload={proxySrc ? 'metadata' : 'none'}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onDurationChange={handleDurationChange}
        onCanPlay={handleDurationChange}
        onEnded={handleEnded}
        onError={async () => {
          setIsLoading(false)
          setIsPlaying(false)
          if (!proxySrc) {
            setError('Áudio sem mídia disponível.')
            return
          }
          // Em vez de cravar "expirado", faz uma requisição fetch para capturar a mensagem real do proxy (401, 400, 404, etc.)
          if (!blobUrl) {
            const resolved = await fetchAudioBlob()
            if (resolved && audioRef.current) {
              audioRef.current.src = resolved
              setError(null)
              return
            }
          }
          if (!error) {
            setError('Áudio não disponível no momento.')
          }
        }}
      />

      {/* Linha do reprodutor estilo WhatsApp */}
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={togglePlay}
          disabled={isLoading}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all active:scale-95 ${
            isOutgoing
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
          }`}
          aria-label={isPlaying ? 'Pausar áudio' : 'Ouvir áudio'}
          title={isPlaying ? 'Pausar áudio' : 'Ouvir áudio'}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isPlaying ? (
            <Pause className="h-4 w-4 fill-current" />
          ) : (
            <Play className="h-4 w-4 fill-current ml-0.5" />
          )}
        </button>

        <div className="flex flex-1 flex-col justify-center gap-1">
          {/* Barra de progresso deslizável */}
          <div className="relative flex items-center h-2 group">
            <input
              type="range"
              min={0}
              max={isValidDuration ? duration : 100}
              value={validCurrentTime}
              onChange={handleSeek}
              disabled={!isValidDuration}
              className="absolute inset-0 h-1.5 w-full cursor-pointer opacity-0 z-10 disabled:cursor-not-allowed"
            />
            {/* Linha visual de fundo */}
            <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-75"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] font-medium leading-none text-slate-500 dark:text-slate-400">
            <span>{formatSeconds(validCurrentTime)}</span>
            <span className="flex items-center gap-1">
              <Volume2 className="h-3 w-3 text-slate-400 inline" />
              {isValidDuration
                ? formatSeconds(duration)
                : cleanDurationLabel || (durationLabel ? 'Áudio' : '0:00')}
            </span>
          </div>
        </div>
      </div>

      {/* Erro de reprodução discreto */}
      {error && (
        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span className="line-clamp-1">{error}</span>
        </div>
      )}

      {/* Transcrição da Zernio (se disponível no payload) */}
      {transcription && (
        <div className="mt-1.5 rounded-md bg-white/70 dark:bg-slate-900/60 p-2 text-xs border border-emerald-500/20 shadow-xs">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-0.5 flex items-center gap-1">
            <span>Transcrição</span>
          </div>
          <p className="text-slate-700 dark:text-slate-200 text-[12px] leading-relaxed select-text italic">
            "{transcription}"
          </p>
        </div>
      )}
    </div>
  )
}
