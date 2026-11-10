import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#F4F7F7] px-4 text-center text-[#464B5F]">
      <div>
        <p className="text-7xl font-bold tracking-tighter">404</p>
        <h1 className="mt-3 text-xl font-bold">Esta página não existe</h1>
        <p className="mt-2 text-sm text-[#747D87]">A inbox continua segura e acessível.</p>
        <Button asChild className="mt-6 bg-[#464B5F]">
          <Link to="/">Voltar ao início</Link>
        </Button>
      </div>
    </main>
  )
}
