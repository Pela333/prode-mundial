import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Trophy, Users, Star, ChevronRight } from 'lucide-react'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/prode')

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col items-center justify-center p-6 text-center">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-amber-500/6 blur-3xl" />
      </div>

      <div className="relative max-w-md animate-fade-in-up">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-500 to-red-500 flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-amber-500/30">
          <Trophy size={40} className="text-white" />
        </div>

        <h1 className="text-4xl font-black text-white mb-3">
          Prode <span className="text-amber-400">Mundial 2026</span>
        </h1>
        <p className="text-slate-400 mb-8">
          Predecí todos los partidos de la fase de grupos. Ganás puntos por acertar resultados exactos o solo el ganador.
        </p>

        <div className="grid grid-cols-2 gap-3 mb-8 text-left">
          {[
            { icon: Star, label: '3 puntos', desc: 'resultado exacto', color: 'text-amber-400' },
            { icon: Trophy, label: '1 punto', desc: 'ganador correcto', color: 'text-green-400' },
            { icon: Users, label: '48 equipos', desc: '12 grupos · 72 partidos', color: 'text-sky-400' },
            { icon: Trophy, label: 'Ranking en vivo', desc: 'competí con amigos', color: 'text-purple-400' },
          ].map(({ icon: Icon, label, desc, color }) => (
            <div key={label} className="rounded-xl bg-white/3 border border-white/6 p-3">
              <Icon size={16} className={`${color} mb-1.5`} />
              <p className="text-white text-sm font-bold">{label}</p>
              <p className="text-slate-500 text-xs">{desc}</p>
            </div>
          ))}
        </div>

        <Link
          href="/login"
          className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 text-black font-bold text-base shadow-xl shadow-amber-500/25 hover:opacity-90 transition-all group"
        >
          Entrar al prode
          <ChevronRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>
    </div>
  )
}
