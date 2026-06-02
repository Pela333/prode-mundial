import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Navbar from '@/components/Navbar'
import { BRACKET_SLOTS, PHASE_LABELS, TEAM_CODES } from '@/lib/fixture'
import type { Phase } from '@/lib/fixture'
import { GitBranch } from 'lucide-react'
import BracketEditor from './BracketEditor'

export const metadata = { title: 'Cruces Eliminatorios · Admin · Prode Mundial 2026' }
export const dynamic = 'force-dynamic'

export default async function AdminBracketPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('username, role')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || profile.role !== 'admin') redirect('/prode')

  // Cargar estado actual del bracket
  const { data: bracketRows } = await supabase
    .from('bracket')
    .select('match_id, phase, position, home_team, away_team, scheduled_at, defined')

  const bracketMap: Record<string, {
    home_team: string | null
    away_team: string | null
    scheduled_at: string | null
    defined: boolean
  }> = {}

  for (const row of bracketRows ?? []) {
    bracketMap[row.match_id] = {
      home_team: row.home_team,
      away_team: row.away_team,
      scheduled_at: row.scheduled_at,
      defined: row.defined ?? false,
    }
  }

  const teams = Object.keys(TEAM_CODES).sort((a, b) => a.localeCompare(b, 'es'))

  // Agrupar slots por fase (en el orden del torneo)
  const phases: Phase[] = ['r32', 'r16', 'qf', 'sf', 'third', 'final']
  const slotsByPhase = phases.map(phase => ({
    phase,
    label: PHASE_LABELS[phase],
    slots: BRACKET_SLOTS.filter(s => s.phase === phase),
  }))

  return (
    <div className="min-h-screen bg-[#0a0f1e]">
      <Navbar username={profile.username} role={profile.role} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-8 animate-fade-in-up">
          <h1 className="text-3xl font-bold text-white mb-1 flex items-center gap-3">
            <GitBranch size={28} className="text-amber-400" />
            Cruces Eliminatorios
          </h1>
          <p className="text-slate-400 text-sm">
            Definí y editá manualmente los cruces de cada fase. Al marcar un cruce como{' '}
            <span className="text-green-400 font-semibold">Definido</span> se habilita para
            que los jugadores carguen su pronóstico.
          </p>
        </div>

        <BracketEditor
          slotsByPhase={slotsByPhase}
          bracketMap={bracketMap}
          teams={teams}
        />
      </main>
    </div>
  )
}
