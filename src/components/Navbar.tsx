'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Trophy, LayoutGrid, LogOut, User, Menu, X, ShieldCheck, Swords, BookOpen } from 'lucide-react'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import LogoBadge from './LogoBadge'

interface NavbarProps {
  username?: string | null
  role?: 'player' | 'admin'
}

export default function Navbar({ username, role }: NavbarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const links: { href: string; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
    { href: '/prode', label: 'Grupos', icon: LayoutGrid },
    { href: '/prode/eliminatoria', label: 'Eliminatoria', icon: Swords },
    { href: '/ranking', label: 'Ranking', icon: Trophy },
    { href: '/reglas', label: 'Reglas', icon: BookOpen },
    { href: '/perfil', label: 'Perfil', icon: User },
  ]
  if (role === 'admin') {
    links.push({ href: '/admin', label: 'Admin', icon: ShieldCheck })
  }

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-[#0a0f1e]/80 backdrop-blur-xl">
      <div className="mx-auto max-w-6xl px-4 flex items-center justify-between h-16">
        <div className="flex items-center gap-3 sm:gap-4 shrink-0">
          <Link href="/prode" className="flex items-center gap-2 shrink-0 group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src="/messi.png" 
              alt="Prode" 
              className="w-12 h-12 object-contain shrink-0 group-hover:scale-105 transition-transform" 
            />
            <span className="font-bold text-white text-lg tracking-tight hidden sm:block whitespace-nowrap shrink-0">
              Prode <span className="text-amber-400">2026</span>
            </span>
          </Link>
          <div className="flex items-center gap-1.5 border-l border-white/10 pl-3 select-none shrink-0">
            <LogoBadge src="/logo-empresa.png" alt="Empresa" fallbackText="EMPRESA" bgGradient="from-amber-500 to-amber-600" heightClass="h-8" />
            <span className="text-slate-500 text-[10px] font-bold">×</span>
            <LogoBadge src="/logo-socia.png" alt="Socia" fallbackText="SOCIA" bgGradient="from-sky-500 to-indigo-600" heightClass="h-6" />
          </div>
        </div>

        <nav className="hidden lg:flex items-center gap-1">
          {links.map(({ href, label, icon: Icon }) => {
            // /prode debe ser exacto (no matchear /prode/eliminatoria)
            const active = href === '/prode'
              ? pathname === '/prode'
              : pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon size={16} />
                {label}
              </Link>
            )
          })}
        </nav>

        <div className="hidden lg:flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
            <User size={14} className="text-slate-400" />
            <span className="text-sm font-medium text-slate-300">{username ?? 'Usuario'}</span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 text-sm transition-all border border-transparent hover:border-red-500/20"
          >
            <LogOut size={15} />
            Salir
          </button>
        </div>

        <button
          className="lg:hidden text-slate-400 hover:text-white p-2"
          onClick={() => setOpen(!open)}
          aria-label="Menú"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {open && (
        <div className="lg:hidden border-t border-white/5 bg-[#0a0f1e] px-4 py-3 space-y-1 animate-fade-in-up">
          {links.map(({ href, label, icon: Icon }) => {
            // /prode debe ser exacto (no matchear /prode/eliminatoria)
            const active = href === '/prode'
              ? pathname === '/prode'
              : pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  active ? 'bg-amber-500/10 text-amber-400' : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon size={16} />
                {label}
              </Link>
            )
          })}
          <div className="pt-2 border-t border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <User size={14} />
              {username ?? 'Usuario'}
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-red-400 text-sm hover:text-red-300"
            >
              <LogOut size={14} />
              Salir
            </button>
          </div>
        </div>
      )}
    </header>
  )
}
