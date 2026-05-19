import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import Navbar from '@/components/Navbar'
import { ArrowLeft, ListTodo } from 'lucide-react'
import ResultsTable, { type ResultRow, type BracketLite } from './ResultsTable'
import { MATCHES, BRACKET_SLOTS, PHASE_LABELS, type Phase } from '@/lib/fixture'

export const metadata = { title: 'Resultados · Admin' }
export const dynamic = 'force-dynamic'

export default async function AdminResultadosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('username, role').eq('id', user.id).maybeSingle()
  if (!profile || profile.role !== 'admin') redirect('/prode')

  const { data: results } = await supabase
    .from('results')
    .select('match_id, phase, home_score, away_score, home_score_120, away_score_120, went_to_pens, pen_winner, status, manual_override, corrected_by, corrected_at, updated_at')
    .order('updated_at', { ascending: false })

  const { data: bracketRows } = await supabase
    .from('bracket').select('match_id, home_team, away_team, scheduled_at, defined')

  // Mapeos para enriquecer la lista
  const bracketByMatch = new Map<string, BracketLite>(
    (bracketRows ?? []).map(b => [b.match_id, {
      home_team: b.home_team,
      away_team: b.away_team,
      scheduled_at: b.scheduled_at,
      defined: b.defined,
    }])
  )

  const groupMatchById = new Map(MATCHES.filter(m => m.phase === 'group').map(m => [m.id, m]))

  // Construyo filas: para grupos uso fixture, para elim uso bracket
  const rows: ResultRow[] = (results ?? []).map(r => {
    const isGroup = r.phase === 'group'
    let home: string | null = null, away: string | null = null, scheduled: string | null = null
    if (isGroup) {
      const m = groupMatchById.get(r.match_id)
      home = m?.home ?? null
      away = m?.away ?? null
      scheduled = m?.date ?? null
    } else {
      const b = bracketByMatch.get(r.match_id)
      home = b?.home_team ?? null
      away = b?.away_team ?? null
      scheduled = b?.scheduled_at ?? null
    }
    return {
      match_id: r.match_id,
      phase: r.phase as Phase,
      phaseLabel: PHASE_LABELS[r.phase as Phase],
      home_team: home,
      away_team: away,
      scheduled_at: scheduled,
      home_score: r.home_score,
      away_score: r.away_score,
      home_score_120: r.home_score_120,
      away_score_120: r.away_score_120,
      went_to_pens: r.went_to_pens,
      pen_winner: r.pen_winner,
      status: r.status as ResultRow['status'],
      manual_override: r.manual_override,
      corrected_at: r.corrected_at,
    }
  })

  // Ordenar por phase + scheduled
  const phaseOrder: Phase[] = ['group', 'r32', 'r16', 'qf', 'sf', 'third', 'final']
  rows.sort((a, b) => {
    const pa = phaseOrder.indexOf(a.phase)
    const pb = phaseOrder.indexOf(b.phase)
    if (pa !== pb) return pa - pb
    const ta = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0
    const tb = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0
    return ta - tb
  })

  // Slots faltantes (resultados que aún no se sincronizaron)
  const knownIds = new Set(rows.map(r => r.match_id))
  const missingGroup = MATCHES.filter(m => m.phase === 'group' && !knownIds.has(m.id)).length
  const missingElim = BRACKET_SLOTS.filter(s => !knownIds.has(s.id)).length

  return (
    <div className="min-h-screen bg-[#0a0f1e]">
      <Navbar username={profile.username} role={profile.role} />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Link href="/admin" className="inline-flex items-center gap-1 text-slate-500 hover:text-amber-400 text-xs mb-3">
          <ArrowLeft size={12} /> Volver al panel
        </Link>
        <div className="mb-8 animate-fade-in-up">
          <h1 className="text-3xl font-bold text-white mb-1 flex items-center gap-3">
            <ListTodo size={28} className="text-amber-400" />
            Resultados reales
          </h1>
          <p className="text-slate-400 text-sm">
            {rows.length} partidos sincronizados ·{' '}
            {missingGroup + missingElim > 0
              ? `${missingGroup + missingElim} pendientes de la API`
              : 'Sin pendientes'}
          </p>
        </div>

        <ResultsTable rows={rows} />
      </main>
    </div>
  )
}
