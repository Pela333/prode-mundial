import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import Navbar from '@/components/Navbar'
import { Trophy, Star, Send } from 'lucide-react'

export const metadata = { title: 'Ranking · Prode Mundial 2026' }
export const dynamic = 'force-dynamic'

interface RankingRow {
  user_id: string
  username: string
  first_name: string
  last_name: string
  total_points: number
  exactos_total: number
  aciertos_grupo: number
  pts_eliminatoria: number
  sent_group: boolean
  sent_r16_first: boolean
  sent_r16_rest: boolean
}

export default async function RankingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('username, role')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile) {
    await supabase.auth.signOut()
    redirect('/login')
  }

  const { data: ranking } = await supabase
    .from('ranking')
    .select('*')

  const rows: RankingRow[] = (ranking ?? []) as RankingRow[]
  const myRank = rows.findIndex(r => r.user_id === user.id) + 1

  // Detección de empate técnico (mismos 4 criterios)
  const tieBuckets = new Map<string, number>()
  for (const r of rows) {
    const key = `${r.total_points}|${r.exactos_total}|${r.aciertos_grupo}|${r.pts_eliminatoria}`
    tieBuckets.set(key, (tieBuckets.get(key) ?? 0) + 1)
  }

  const podiumColors = ['text-amber-400', 'text-slate-300', 'text-amber-600']
  const podiumBg = [
    'bg-amber-500/10 border-amber-500/20',
    'bg-slate-700/20 border-slate-600/20',
    'bg-amber-700/10 border-amber-700/20',
  ]

  return (
    <div className="min-h-screen bg-[#0a0f1e]">
      <Navbar username={profile?.username} role={profile?.role} />

      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-8 animate-fade-in-up">
          <h1 className="text-3xl font-bold text-white mb-1 flex items-center gap-3">
            <Trophy size={28} className="text-amber-400" />
            Ranking general
          </h1>
          <p className="text-slate-400 text-sm">
            Tu posición:{' '}
            <span className="text-amber-400 font-bold">
              #{myRank > 0 ? myRank : '–'}
            </span>
          </p>
        </div>

        {rows.length >= 3 && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[rows[0], rows[1], rows[2]].map((r, i) => (
              <div key={r.user_id} className={`rounded-2xl border p-4 text-center ${podiumBg[i]}`}>
                <div className={`text-2xl font-black mb-1 ${podiumColors[i]}`}>#{i + 1}</div>
                <div className="w-10 h-10 rounded-full bg-slate-700 mx-auto mb-2 flex items-center justify-center text-white font-bold text-lg">
                  {r.first_name?.[0]?.toUpperCase()}
                </div>
                <p className="text-white font-semibold text-sm truncate">
                  {r.first_name} {r.last_name}
                </p>
                <p className={`text-xl font-black ${podiumColors[i]}`}>{r.total_points} pts</p>
                <p className="text-slate-500 text-xs">{r.exactos_total} exactos</p>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-2xl border border-white/6 overflow-hidden bg-[#111827]">
          <div className="grid grid-cols-[2rem_1fr_auto_auto_auto] gap-4 px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-white/5">
            <span>#</span>
            <span>Jugador</span>
            <span className="text-right">Envío</span>
            <span className="text-right">Exactos</span>
            <span className="text-right">Puntos</span>
          </div>

          {rows.length === 0 && (
            <div className="py-12 text-center text-slate-500 text-sm">
              Todavía no hay participantes en el ranking.
            </div>
          )}

          {rows.map((r, i) => {
            const isMe = r.user_id === user.id
            const tieKey = `${r.total_points}|${r.exactos_total}|${r.aciertos_grupo}|${r.pts_eliminatoria}`
            const tied = (tieBuckets.get(tieKey) ?? 0) > 1
            return (
              <div
                key={r.user_id}
                className={`grid grid-cols-[2rem_1fr_auto_auto_auto] gap-4 px-4 py-3 items-center border-b border-white/4 last:border-0 transition-colors
                  ${isMe ? 'bg-amber-500/5 border-l-2 border-l-amber-500' : 'hover:bg-white/2'}`}
              >
                <span className={`text-sm font-bold ${i < 3 ? podiumColors[i] : 'text-slate-500'}`}>
                  {i + 1}
                  {tied && <span className="text-slate-600 ml-0.5" title="Empate técnico">⇄</span>}
                </span>

                <Link href={`/ranking/usuarios/${r.user_id}`} className="flex items-center gap-2 min-w-0 group/player">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-700 to-slate-600 flex items-center justify-center text-white text-sm font-bold shrink-0 group-hover/player:scale-105 transition-transform">
                    {r.first_name?.[0]?.toUpperCase()}
                  </div>
                  <span className={`text-sm font-medium truncate group-hover/player:text-amber-400 transition-colors ${isMe ? 'text-amber-400' : 'text-white'}`}>
                    {r.first_name} {r.last_name}
                    {isMe && <span className="text-xs text-amber-500 ml-1">(vos)</span>}
                  </span>
                </Link>

                <span className="text-right" title="Estado de envíos">
                  <Send
                    size={13}
                    className={r.sent_group ? 'text-green-500 inline' : 'text-slate-700 inline'}
                  />
                </span>

                <div className="flex items-center gap-1 justify-end">
                  <Star size={12} className="text-amber-400" />
                  <span className="text-sm font-semibold text-amber-400">{r.exactos_total}</span>
                </div>

                <span className="text-sm font-bold text-white text-right">{r.total_points}</span>
              </div>
            )
          })}
        </div>

        <div className="mt-4 text-xs text-slate-600 space-y-1">
          <p>Empate técnico (⇄): coinciden en los 4 criterios de desempate.</p>
          <p>
            Desempates: 1) más exactos · 2) más posiciones de grupo · 3) más puntos en eliminatoria · 4) división del premio.
          </p>
        </div>
      </main>
    </div>
  )
}
