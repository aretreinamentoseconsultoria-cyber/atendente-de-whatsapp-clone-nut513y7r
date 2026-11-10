import { useState, useRef, useEffect, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AloLogo } from '@/components/AloLogo'
import { BlurText } from '@/components/reactbits/BlurText'
import { LandingVideoBackground } from '@/components/landing/LandingVideoBackground'
import { InteractiveDemoMockup } from '@/components/landing/InteractiveDemoMockup'
import { ZernioLogo, ZernioBadge, ZERNIO_REFERRAL_URL } from '@/components/ZernioLogo'
import { AppIcons } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/contexts/AuthContext'

const ROTATING_WORDS = ['escapar.', 'esfriar.', 'passar.', 'sumir.', 'ficar sem resposta.']

export default function Landing() {
  const { user, login, register } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [wordIndex, setWordIndex] = useState(0)
  const [isWordVisible, setIsWordVisible] = useState(true)

  const mockupRef = useRef<HTMLDivElement>(null)

  // Rotação da palavra com fade suave a cada ~2.8s respeitando reduced motion
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (mediaQuery.matches) return

    const interval = setInterval(() => {
      setIsWordVisible(false)
      setTimeout(() => {
        setWordIndex((prev) => (prev + 1) % ROTATING_WORDS.length)
        setIsWordVisible(true)
      }, 280) // transição de saída antes de trocar
    }, 2800)

    return () => clearInterval(interval)
  }, [])

  async function handleAuth(event: FormEvent<HTMLFormElement>, mode: 'login' | 'register') {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      if (mode === 'login') {
        await login(String(data.get('email')), String(data.get('password')))
      } else {
        await register(
          String(data.get('name')),
          String(data.get('email')),
          String(data.get('password')),
        )
      }
      navigate('/inbox')
    } catch {
      setError(
        mode === 'login'
          ? 'E-mail ou senha inválidos.'
          : 'Não foi possível criar a conta. Confira os dados.',
      )
    } finally {
      setBusy(false)
    }
  }

  const openAuth = (mode: 'login' | 'register' = 'login') => {
    if (user) {
      navigate('/inbox')
      return
    }
    setAuthTab(mode)
    setError('')
    setOpen(true)
  }

  const scrollToMockup = () => {
    mockupRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="relative min-h-screen w-full bg-white text-[#464B5F] antialiased">
      {/* Vídeo de fundo em loop do usuário com overlay da identidade Fernand */}
      <LandingVideoBackground className="h-[920px] max-h-[1080px]" />

      <div className="relative z-10 flex min-h-screen flex-col">
        {/* HEADER: Fino, limpo e sem logo nesta página a pedido do usuário */}
        <header className="mx-auto flex h-16 w-full max-w-7xl items-center justify-end px-6 sm:px-10">
          {/* Navegação e botões à direita */}
          <nav className="flex items-center gap-3 sm:gap-6">
            {user ? (
              <Button
                onClick={() => navigate('/inbox')}
                className="h-10 rounded-lg bg-[#464B5F] px-5 text-sm font-medium text-white shadow-sm hover:bg-[#373C4F]"
              >
                Abrir inbox <AppIcons.arrowNavRight className="ml-1.5 h-4 w-4" />
              </Button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => openAuth('login')}
                  className="px-2 text-sm font-normal text-[#464B5F] transition-colors hover:text-black"
                >
                  Log in
                </button>
                <button
                  type="button"
                  onClick={scrollToMockup}
                  className="hidden rounded-lg border border-[#CBD6D7] bg-white px-4 py-2 text-sm font-medium text-[#464B5F] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all hover:bg-[#FBFBFB] hover:text-black sm:inline-block"
                >
                  Ver demonstração
                </button>
                <Button
                  onClick={() => openAuth('login')}
                  className="h-10 rounded-lg bg-[#464B5F] px-4 text-sm font-medium text-white shadow-sm hover:bg-[#373C4F] sm:px-5"
                >
                  Experimentar ao vivo
                </Button>
              </>
            )}
          </nav>
        </header>

        {/* HERO: Distribuição ampla na largura da tela, aproveitando melhor o espaço */}
        <section className="mx-auto w-full max-w-7xl px-6 pt-4 sm:px-10 sm:pt-6 lg:pt-8">
          <div className="w-full text-left">
            {/* Badge de Integração Oficial Zernio no topo da Hero */}
            <div className="mb-4 inline-block">
              <ZernioBadge variant="pill" label="Integração oficial Meta via" logoHeight={17} />
            </div>

            {/* Linha 1: "Olá," em destaque grande */}
            <div className="text-4xl font-semibold tracking-[-0.038em] text-[#464B5F] sm:text-5xl md:text-6xl lg:text-[68px]">
              Olá,
            </div>

            {/* Linha 2 em diante: "Sou seu assistente de WhatsApp que nunca deixa o lead [PALAVRA ROTATIVA]" */}
            <h1 className="mt-4 text-balance text-4xl font-semibold leading-[1.1] tracking-[-0.038em] text-[#464B5F] sm:mt-6 sm:text-5xl md:text-6xl lg:text-[68px] lg:leading-[1.12]">
              <span>
                Sou seu assistente de <span className="text-[#2C8A55] font-semibold">WhatsApp</span>{' '}
                que nunca deixa o lead{' '}
              </span>
              <span
                className={`landing-underline inline-block transition-all duration-300 ${
                  isWordVisible
                    ? 'opacity-100 translate-y-0 filter-none'
                    : 'opacity-0 -translate-y-1.5 blur-[4px]'
                }`}
              >
                {ROTATING_WORDS[wordIndex]}
              </span>
            </h1>

            {/* Subtítulo: ciclo completo com API oficial em destaque */}
            <p className="mt-6 max-w-3xl text-balance text-base leading-relaxed text-[#7A808F] sm:text-lg sm:leading-8">
              <span>
                O assistente que lê suas conversas, prioriza o que importa, sugere a resposta ideal
                e envia pela{' '}
              </span>
              <strong className="font-semibold text-[#464B5F]">API oficial</strong>
              <span> da Meta — completando o ciclo com você no controle.</span>
            </p>

            {/* Linha de botões da Hero: Primário escuro + Secundário branco com borda fina */}
            <div className="mt-7 flex flex-wrap items-center gap-3.5 sm:mt-8">
              <Button
                onClick={() => openAuth('login')}
                size="lg"
                className="h-12 rounded-lg bg-[#464B5F] px-6 text-sm font-medium text-white shadow-sm hover:bg-[#373C4F]"
              >
                Experimentar o assistente
                <span className="ml-2.5 hidden rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-white sm:inline-block">
                  R
                </span>
              </Button>

              <button
                type="button"
                onClick={scrollToMockup}
                className="inline-flex h-12 items-center justify-center rounded-lg border border-[#CBD6D7] bg-white px-6 text-sm font-medium text-[#464B5F] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all hover:bg-[#FBFBFB] hover:text-black"
              >
                Ver demonstração ao vivo
              </button>
            </div>

            {/* Microlabel do ciclo completo e segurança com API oficial */}
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[#8A909C]">
              <AppIcons.shieldSafe className="h-4 w-4 text-[#57D067] shrink-0" />
              <span>Ciclo completo: Lê · Prioriza · Sugere · Envia · API Oficial Meta via</span>
              <a
                href={ZERNIO_REFERRAL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-[#464B5F] hover:text-[#2C8A55] transition-colors"
                title="Conhecer a Zernio"
              >
                <ZernioLogo height={14} raw className="translate-y-[0.5px]" />
                <span className="text-[10px] text-[#A3A5AF]">↗</span>
              </a>
            </div>
          </div>
        </section>

        {/* MOCKUP DO PRODUTO: Demonstração interativa coreografada em 3 cenas que se desmontam e remontam */}
        <section ref={mockupRef} className="mx-auto mt-14 w-full max-w-7xl px-4 sm:mt-20 sm:px-8">
          <InteractiveDemoMockup onOpenAuth={openAuth} />
        </section>

        {/* Bloco discreto de rodapé com o aviso obrigatório de risco */}
        <footer className="mt-auto border-t border-[#CBD6D7] bg-[#FBFBFB] py-8 text-center">
          <div className="mx-auto max-w-4xl px-6">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6 text-xs text-[#7A808F]">
              <span className="text-[11px] text-[#A3A5AF]">
                © {new Date().getFullYear()} Alô — Atendente de WhatsApp
              </span>
              <span className="hidden sm:inline text-[#CBD6D7]">·</span>
              <a
                href={ZERNIO_REFERRAL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[11px] text-[#7A808F] hover:text-[#2C8A55] transition-colors"
                title="Zernio — Integração oficial com WhatsApp Business"
              >
                <span>Conexão oficial Meta via</span>
                <ZernioLogo height={14} raw className="translate-y-[0.5px]" />
                <span className="text-[10px] text-[#A3A5AF]">↗</span>
              </a>
              <span className="hidden sm:inline text-[#CBD6D7]">·</span>
              <button
                type="button"
                onClick={() => openAuth('login')}
                className="text-[11px] text-[#A3A5AF] hover:text-[#464B5F] hover:underline"
              >
                Acesso do operador
              </button>
            </div>
          </div>
        </footer>
      </div>

      {/* MODAL DE LOGIN / CRIAÇÃO DE CONTA (Clean, low-contrast, sem sombras pesadas) */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="border border-[#CBD6D7] bg-white p-6 shadow-[0_20px_50px_rgba(70,75,95,0.12)] sm:max-w-md">
          <DialogHeader className="text-left">
            <div className="mb-3 flex items-center gap-2">
              <AloLogo height={34} />
            </div>
            <DialogTitle className="text-xl font-bold tracking-tight text-[#464B5F]">
              {authTab === 'login' ? 'Acessar o assistente' : 'Criar sua conta'}
            </DialogTitle>
            <DialogDescription className="text-xs text-[#A3A5AF]">
              {authTab === 'login'
                ? 'Acesse a caixa de entrada para ler, priorizar, sugerir e enviar com agilidade.'
                : 'Crie seu acesso para explorar o ciclo completo de atendimento.'}
            </DialogDescription>
          </DialogHeader>

          <Tabs
            value={authTab}
            onValueChange={(v) => {
              setAuthTab(v as 'login' | 'register')
              setError('')
            }}
            className="mt-2"
          >
            <TabsList className="grid w-full grid-cols-2 rounded-lg border border-[#CBD6D7] bg-[#FBFBFB] p-1">
              <TabsTrigger
                value="login"
                className="rounded-md text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-[#464B5F] data-[state=active]:shadow-sm"
              >
                Já tenho conta
              </TabsTrigger>
              <TabsTrigger
                value="register"
                className="rounded-md text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-[#464B5F] data-[state=active]:shadow-sm"
              >
                Criar conta
              </TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="mt-4">
              <AuthForm
                mode="login"
                busy={busy}
                error={error}
                onSubmit={(e) => void handleAuth(e, 'login')}
              />
            </TabsContent>

            <TabsContent value="register" className="mt-4">
              <AuthForm
                mode="register"
                busy={busy}
                error={error}
                onSubmit={(e) => void handleAuth(e, 'register')}
              />
            </TabsContent>
          </Tabs>

          <div className="mt-4 border-t border-[#CBD6D7] pt-3 text-center">
            <div className="flex items-center justify-center gap-1.5 text-[11px] leading-tight text-[#A3A5AF]">
              <span>🔒 API Oficial da Meta via</span>
              <a
                href={ZERNIO_REFERRAL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-[#464B5F] hover:text-[#2C8A55] transition-colors"
              >
                <ZernioLogo height={13} raw className="translate-y-[0.5px]" />
                <span className="text-[9px] text-[#A3A5AF]">↗</span>
              </a>
              <span>· Você sempre no controle.</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AuthForm({
  mode,
  busy,
  error,
  onSubmit,
}: {
  mode: 'login' | 'register'
  busy: boolean
  error: string
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-3.5">
      {mode === 'register' && (
        <div>
          <Label htmlFor={`${mode}-name`} className="text-xs font-medium text-[#464B5F]">
            Nome completo
          </Label>
          <Input
            className="mt-1 h-9 rounded-md border-[#CBD6D7] bg-white text-xs text-[#464B5F] placeholder:text-[#A3A5AF] focus-visible:ring-1 focus-visible:ring-[#464B5F]"
            id={`${mode}-name`}
            name="name"
            required
            placeholder="Como podemos chamar você?"
          />
        </div>
      )}
      <div>
        <Label htmlFor={`${mode}-email`} className="text-xs font-medium text-[#464B5F]">
          E-mail de trabalho
        </Label>
        <Input
          className="mt-1 h-9 rounded-md border-[#CBD6D7] bg-white text-xs text-[#464B5F] placeholder:text-[#A3A5AF] focus-visible:ring-1 focus-visible:ring-[#464B5F]"
          id={`${mode}-email`}
          name="email"
          type="email"
          required
          placeholder="voce@empresa.com.br"
        />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <Label htmlFor={`${mode}-password`} className="text-xs font-medium text-[#464B5F]">
            Senha
          </Label>
          {mode === 'login' && (
            <Link
              to="/forgot-password"
              className="text-[11px] text-[#A3A5AF] hover:text-[#464B5F] hover:underline"
            >
              Esqueci minha senha
            </Link>
          )}
        </div>
        <Input
          className="mt-1 h-9 rounded-md border-[#CBD6D7] bg-white text-xs text-[#464B5F] placeholder:text-[#A3A5AF] focus-visible:ring-1 focus-visible:ring-[#464B5F]"
          id={`${mode}-password`}
          name="password"
          type="password"
          minLength={8}
          required
          placeholder="Mínimo de 8 caracteres"
        />
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-600">
          {error}
        </div>
      )}

      <Button
        disabled={busy}
        className="mt-2 h-10 w-full rounded-md bg-[#464B5F] text-xs font-medium text-white hover:bg-[#373C4F]"
      >
        {busy ? 'Processando...' : mode === 'login' ? 'Entrar na inbox' : 'Criar conta e entrar'}
      </Button>
    </form>
  )
}
