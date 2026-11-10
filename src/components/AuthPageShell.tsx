import { Link } from 'react-router-dom'

import Brand from '@/components/Brand'

export default function AuthPageShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="auth-page">
      <header className="public-header auth-header">
        <Link to="/" aria-label="Voltar para o início">
          <Brand />
        </Link>
        <Link className="quiet-link" to="/">
          Voltar ao início
        </Link>
      </header>
      <main className="auth-page-main">
        <section className="auth-card animate-fade-in-up">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="auth-description">{description}</p>
          {children}
        </section>
      </main>
    </div>
  )
}
